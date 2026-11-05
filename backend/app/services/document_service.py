"""
Document business logic.

Concurrency model (full write-up in docs/concurrency.md):

- Every document carries a server-authoritative `revision` integer.
- A write must include the revision the client believes the document is at.
- The service locks the document row (`SELECT ... FOR UPDATE`, with populate_existing so
  a cached copy can never be used), so concurrent writers on one document are serialized
  by PostgreSQL itself.
- A mismatched revision is rejected (`StaleRevisionError`) and the client rebases its
  unsent edits on top of the server's current state, then retries.
- A successful write bumps revision by exactly 1 and records history in the same transaction.

Workflow model:

- status: draft -> in_review -> approved, with archived as an off-ramp. Transitions that
  enter or leave `approved` are Owner-only. Archived documents are read-only.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.document import Document, DocumentStatus, DocumentType
from app.models.workspace import WorkspaceRole
from app.repositories.document_repo import DocumentRepository
from app.repositories.user_repo import UserRepository
from app.schemas.document import DocumentVersionDetail, DocumentVersionOut
from app.schemas.search import SearchResult
from app.services.activity_service import ActivityService
from app.services.permission_service import require_role
from app.services.realtime import publish_document_event

settings = get_settings()

ALLOWED_TRANSITIONS: dict[DocumentStatus, set[DocumentStatus]] = {
    DocumentStatus.DRAFT: {DocumentStatus.IN_REVIEW, DocumentStatus.ARCHIVED},
    DocumentStatus.IN_REVIEW: {DocumentStatus.DRAFT, DocumentStatus.APPROVED, DocumentStatus.ARCHIVED},
    DocumentStatus.APPROVED: {DocumentStatus.IN_REVIEW, DocumentStatus.ARCHIVED},
    DocumentStatus.ARCHIVED: {DocumentStatus.DRAFT},
}

STATUS_LABELS = {
    DocumentStatus.DRAFT: "Draft",
    DocumentStatus.IN_REVIEW: "In Review",
    DocumentStatus.APPROVED: "Approved",
    DocumentStatus.ARCHIVED: "Archived",
}
TYPE_LABELS = {
    DocumentType.SPEC: "Spec",
    DocumentType.RFC: "RFC",
    DocumentType.MEETING_NOTES: "Meeting Notes",
    DocumentType.SPRINT_PLAN: "Sprint Plan",
}


class StaleRevisionError(HTTPException):
    def __init__(self, current_revision: int):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "STALE_REVISION", "current_revision": current_revision},
        )


class DocumentArchivedError(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "DOCUMENT_ARCHIVED",
                "message": "Archived documents are read-only. Move it back to Draft to edit.",
            },
        )


class DocumentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = DocumentRepository(db)
        self.activity = ActivityService(db)
        self.users = UserRepository(db)

    # ------------------------------------------------------------------ helpers

    async def _get_or_404(self, document_id: uuid.UUID) -> Document:
        doc = await self.repo.get_by_id(document_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return doc

    async def _lock_or_404(self, document_id: uuid.UUID) -> Document:
        doc = await self.repo.get_for_update(document_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return doc

    async def _record_version(self, doc: Document, user_id: uuid.UUID, force_new: bool = False) -> bool:
        """
        Write history for the document's current state. Returns True if a NEW history
        entry was created, False if the user's open editing session was extended.

        An "editing session" = consecutive edits by the same user within
        VERSION_COALESCE_SECONDS. Without this, a 400ms-debounced editor would create a
        history row for every pause in typing. Sessions are sealed by time, by a different
        editor, and by restores (force_new). The seed version (rev 0) is never touched.
        """
        latest = await self.repo.latest_version_with_age(doc.id)
        if (
            not force_new
            and latest is not None
            and latest[0].edited_by == user_id
            and latest[0].revision > 0
            and latest[1] < settings.VERSION_COALESCE_SECONDS
        ):
            version = latest[0]
            version.revision = doc.revision
            version.content = doc.content
            version.title = doc.title
            await self.db.flush()
            return False
        await self.repo.add_version(
            document_id=doc.id, revision=doc.revision, content=doc.content, title=doc.title, edited_by=user_id
        )
        return True

    async def _broadcast_operation(self, doc: Document, user_id: uuid.UUID, origin: str) -> None:
        actor = await self.users.get_by_id(user_id)
        await publish_document_event(doc.id, {
            "type": "operation",
            "revision": doc.revision,
            "content": doc.content,
            "title": doc.title,
            "edited_by": str(user_id),
            "edited_by_name": actor.name if actor else "Someone",
            "origin": origin,
        })

    # ------------------------------------------------------------------ CRUD

    async def create_document(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID, title: str, content: str,
        doc_type: DocumentType = DocumentType.SPEC,
    ) -> Document:
        await require_role(self.db, workspace_id, user_id, WorkspaceRole.EDITOR)
        doc = await self.repo.create(workspace_id, title, content, user_id, doc_type)
        await self.activity.log(
            workspace_id, user_id, "document.created",
            f'Created {TYPE_LABELS[doc_type]} "{title}"', doc.id,
        )
        await self.db.commit()
        return doc

    async def get_document(self, document_id: uuid.UUID, user_id: uuid.UUID) -> Document:
        doc, _ = await self.get_document_with_role(document_id, user_id)
        return doc

    async def get_document_with_role(self, document_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Document, WorkspaceRole]:
        doc = await self._get_or_404(document_id)
        membership = await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.VIEWER)
        return doc, membership.role

    async def list_documents(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID, search: str | None = None,
        status_filter: DocumentStatus | None = None, limit: int = 50, offset: int = 0,
    ) -> list[Document]:
        await require_role(self.db, workspace_id, user_id, WorkspaceRole.VIEWER)
        return await self.repo.list_for_workspace(workspace_id, search, status_filter, limit, offset)

    async def search(self, user_id: uuid.UUID, term: str, limit: int = 20) -> list[SearchResult]:
        term = term.strip()
        if not term:
            return []
        rows = await self.repo.search_for_user(user_id, term, limit)
        return [
            SearchResult(
                id=doc.id, title=doc.title, doc_type=doc.doc_type, status=doc.status,
                workspace_id=doc.workspace_id, workspace_name=ws_name,
                snippet=snippet,
                updated_at=doc.updated_at,
            )
            for doc, ws_name, snippet in rows
        ]

    async def delete_document(self, document_id: uuid.UUID, user_id: uuid.UUID) -> None:
        doc = await self._get_or_404(document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.OWNER)
        workspace_id, title = doc.workspace_id, doc.title
        await self.repo.delete(doc)
        await self.activity.log(workspace_id, user_id, "document.deleted", f'Deleted "{title}"')
        await self.db.commit()

    async def update_document(
        self, document_id: uuid.UUID, user_id: uuid.UUID,
        title: str | None, content: str | None, client_revision: int,
    ) -> Document:
        """Revision-checked REST update (rename / one-shot save from a non-WebSocket client)."""
        doc = await self._get_or_404(document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.EDITOR)

        locked = await self._lock_or_404(document_id)
        if locked.status == DocumentStatus.ARCHIVED:
            raise DocumentArchivedError()
        if locked.revision != client_revision:
            raise StaleRevisionError(current_revision=locked.revision)

        if title is not None:
            locked.title = title
        if content is not None:
            locked.content = content
        locked.revision += 1
        locked.last_edited_by = user_id

        created = await self._record_version(locked, user_id)
        if created:
            await self.activity.log(locked.workspace_id, user_id, "document.edited", f'Edited "{locked.title}"', locked.id)
        await self.db.commit()
        await self.db.refresh(locked)
        await self._broadcast_operation(locked, user_id, origin="rest")
        return locked

    async def apply_operation(
        self, document_id: uuid.UUID, user_id: uuid.UUID,
        base_revision: int, new_content: str, new_title: str | None = None,
    ) -> tuple[Document, bool]:
        """
        Apply one real-time edit from the WebSocket. Returns (document, changed).

        `changed` is False for no-ops (e.g. a title blur with no change) -- those do not
        bump the revision, create history, or get broadcast.
        """
        doc = await self._get_or_404(document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.EDITOR)

        locked = await self._lock_or_404(document_id)
        if locked.status == DocumentStatus.ARCHIVED:
            raise DocumentArchivedError()
        if locked.revision != base_revision:
            raise StaleRevisionError(current_revision=locked.revision)

        title_changed = bool(new_title is not None and new_title.strip() and new_title != locked.title)
        if new_content == locked.content and not title_changed:
            await self.db.commit()  # nothing changed; just release the row lock
            return locked, False

        locked.content = new_content
        if title_changed:
            locked.title = new_title[:500]
        locked.revision += 1
        locked.last_edited_by = user_id

        created = await self._record_version(locked, user_id)
        if created:
            await self.activity.log(locked.workspace_id, user_id, "document.edited", f'Edited "{locked.title}"', locked.id)
        await self.db.commit()
        await self.db.refresh(locked)
        return locked, True

    # ------------------------------------------------------------------ workflow

    async def update_meta(
        self, document_id: uuid.UUID, user_id: uuid.UUID,
        new_status: DocumentStatus | None, new_type: DocumentType | None,
    ) -> Document:
        doc = await self._get_or_404(document_id)
        membership = await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.EDITOR)
        is_owner = membership.role == WorkspaceRole.OWNER

        locked = await self._lock_or_404(document_id)
        changes: list[str] = []

        if new_status is not None and new_status != locked.status:
            if new_status not in ALLOWED_TRANSITIONS[locked.status]:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot move a document from {STATUS_LABELS[locked.status]} to {STATUS_LABELS[new_status]}",
                )
            if DocumentStatus.APPROVED in (locked.status, new_status) and not is_owner:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only a workspace owner can approve a document or change an approved one",
                )
            old = locked.status
            locked.status = new_status
            await self.activity.log(
                locked.workspace_id, user_id, "document.status_changed",
                f'Changed "{locked.title}" status from {STATUS_LABELS[old]} to {STATUS_LABELS[new_status]}',
                locked.id,
            )
            changes.append("status")

        if new_type is not None and new_type != locked.doc_type:
            if locked.status == DocumentStatus.ARCHIVED:
                raise DocumentArchivedError()
            old_type = locked.doc_type
            locked.doc_type = new_type
            await self.activity.log(
                locked.workspace_id, user_id, "document.type_changed",
                f'Changed "{locked.title}" type from {TYPE_LABELS[old_type]} to {TYPE_LABELS[new_type]}',
                locked.id,
            )
            changes.append("type")

        if not changes:
            await self.db.commit()  # nothing changed; release the row lock
            return locked

        await self.db.commit()
        await self.db.refresh(locked)
        actor = await self.users.get_by_id(user_id)
        await publish_document_event(locked.id, {
            "type": "meta",
            "status": locked.status.value,
            "doc_type": locked.doc_type.value,
            "changed_by_name": actor.name if actor else "Someone",
        })
        return locked

    # ------------------------------------------------------------------ history

    async def list_versions(
        self, document_id: uuid.UUID, user_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> list[DocumentVersionOut]:
        doc = await self.get_document(document_id, user_id)
        rows = await self.repo.list_versions(doc.id, limit, offset)
        return [
            DocumentVersionOut(
                id=v.id, revision=v.revision, title=v.title,
                edited_by=v.edited_by, edited_by_name=name, created_at=v.created_at,
            )
            for v, name in rows
        ]

    async def get_version(self, document_id: uuid.UUID, user_id: uuid.UUID, version_id: uuid.UUID) -> DocumentVersionDetail:
        doc = await self.get_document(document_id, user_id)
        found = await self.repo.get_version_with_name(version_id)
        if found is None or found[0].document_id != doc.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
        v, name = found
        return DocumentVersionDetail(
            id=v.id, revision=v.revision, title=v.title, content=v.content,
            edited_by=v.edited_by, edited_by_name=name, created_at=v.created_at,
        )

    async def restore_version(self, document_id: uuid.UUID, user_id: uuid.UUID, version_id: uuid.UUID) -> Document:
        doc = await self._get_or_404(document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.EDITOR)

        version = await self.repo.get_version(version_id)
        if version is None or version.document_id != doc.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

        locked = await self._lock_or_404(document_id)
        if locked.status == DocumentStatus.ARCHIVED:
            raise DocumentArchivedError()

        # Restoring never rewrites history: it appends a NEW revision with the old content.
        locked.content = version.content
        locked.title = version.title
        locked.revision += 1
        locked.last_edited_by = user_id

        await self._record_version(locked, user_id, force_new=True)
        await self.activity.log(
            locked.workspace_id, user_id, "document.restored",
            f'Restored "{locked.title}" to version {version.revision}', locked.id,
        )
        await self.db.commit()
        await self.db.refresh(locked)
        await self._broadcast_operation(locked, user_id, origin="restore")
        return locked
