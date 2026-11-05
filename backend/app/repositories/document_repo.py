import uuid

from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentStatus, DocumentType, DocumentVersion
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


def escape_like(term: str) -> str:
    """Escape LIKE wildcards so user input like '100%' or '_' is matched literally."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def make_snippet(content: str, term: str, radius: int = 60) -> str | None:
    idx = content.lower().find(term.lower())
    if idx < 0:
        return None
    start = max(0, idx - radius)
    end = min(len(content), idx + len(term) + radius)
    snippet = content[start:end].replace("\n", " ").strip()
    return ("…" if start > 0 else "") + snippet + ("…" if end < len(content) else "")


class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self, workspace_id: uuid.UUID, title: str, content: str, created_by: uuid.UUID,
        doc_type: DocumentType = DocumentType.SPEC,
    ) -> Document:
        doc = Document(
            workspace_id=workspace_id,
            title=title,
            content=content,
            doc_type=doc_type,
            status=DocumentStatus.DRAFT,
            revision=0,
            created_by=created_by,
            last_edited_by=created_by,
        )
        self.db.add(doc)
        await self.db.flush()
        # Seed version 0 so history always has a starting point.
        self.db.add(
            DocumentVersion(document_id=doc.id, revision=0, content=content, title=title, edited_by=created_by)
        )
        await self.db.flush()
        return doc

    async def get_by_id(self, document_id: uuid.UUID) -> Document | None:
        return await self.db.get(Document, document_id)

    async def get_for_update(self, document_id: uuid.UUID) -> Document | None:
        """
        Row-level lock that serializes concurrent writers on the same document.
        populate_existing forces the ORM to overwrite any cached copy with the
        freshly-locked row, so the revision check can never run against stale state.
        """
        result = await self.db.execute(
            select(Document)
            .where(Document.id == document_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_for_workspace(
        self, workspace_id: uuid.UUID, search: str | None = None,
        status: DocumentStatus | None = None, limit: int = 50, offset: int = 0,
    ) -> list[Document]:
        stmt = select(Document).where(Document.workspace_id == workspace_id)
        if status is not None:
            stmt = stmt.where(Document.status == status)
        if search:
            pattern = f"%{escape_like(search)}%"
            stmt = stmt.where(or_(Document.title.ilike(pattern, escape="\\"), Document.content.ilike(pattern, escape="\\")))
        stmt = stmt.order_by(Document.updated_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def search_for_user(self, user_id: uuid.UUID, term: str, limit: int = 20) -> list[tuple[Document, str, str | None]]:
        """Cross-workspace search restricted to workspaces the user is a member of."""
        pattern = f"%{escape_like(term)}%"
        stmt = (
            select(Document, Workspace.name)
            .join(Workspace, Workspace.id == Document.workspace_id)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(
                WorkspaceMember.user_id == user_id,
                or_(Document.title.ilike(pattern, escape="\\"), Document.content.ilike(pattern, escape="\\")),
            )
            .order_by(Document.updated_at.desc())
            .limit(limit)
        )
        rows = (await self.db.execute(stmt)).all()
        return [(doc, ws_name, make_snippet(doc.content, term)) for doc, ws_name in rows]

    async def delete(self, document: Document) -> None:
        await self.db.delete(document)
        await self.db.flush()

    # ---- versions ----

    async def add_version(
        self, document_id: uuid.UUID, revision: int, content: str, title: str, edited_by: uuid.UUID
    ) -> DocumentVersion:
        version = DocumentVersion(
            document_id=document_id, revision=revision, content=content, title=title, edited_by=edited_by
        )
        self.db.add(version)
        await self.db.flush()
        return version

    async def latest_version_with_age(self, document_id: uuid.UUID) -> tuple[DocumentVersion, float] | None:
        """Newest version plus its age in seconds, measured by the database clock."""
        stmt = (
            select(DocumentVersion, extract("epoch", func.now() - DocumentVersion.created_at))
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.revision.desc())
            .limit(1)
        )
        row = (await self.db.execute(stmt)).first()
        if row is None:
            return None
        return row[0], float(row[1])

    async def list_versions(
        self, document_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> list[tuple[DocumentVersion, str]]:
        stmt = (
            select(DocumentVersion, User.name)
            .join(User, User.id == DocumentVersion.edited_by)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.revision.desc())
            .limit(limit)
            .offset(offset)
        )
        return [(v, name) for v, name in (await self.db.execute(stmt)).all()]

    async def get_version(self, version_id: uuid.UUID) -> DocumentVersion | None:
        return await self.db.get(DocumentVersion, version_id)

    async def get_version_with_name(self, version_id: uuid.UUID) -> tuple[DocumentVersion, str] | None:
        stmt = (
            select(DocumentVersion, User.name)
            .join(User, User.id == DocumentVersion.edited_by)
            .where(DocumentVersion.id == version_id)
        )
        row = (await self.db.execute(stmt)).first()
        return (row[0], row[1]) if row else None
