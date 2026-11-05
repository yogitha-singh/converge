import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment, CommentReply
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.repositories.comment_repo import CommentRepository
from app.repositories.document_repo import DocumentRepository
from app.repositories.user_repo import UserRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.comment import CommentOut, ReplyOut
from app.services.notification_service import NotificationService
from app.services.permission_service import require_role
from app.services.realtime import publish_document_event

MENTION_RE = re.compile(r"@([\w.\-]+)")


def extract_mention_tokens(text: str) -> set[str]:
    return {m.group(1).lower() for m in MENTION_RE.finditer(text)}


def user_handles(user: User) -> set[str]:
    """Strings that `@handle` can resolve to: the name without spaces, or the email local part."""
    return {user.name.replace(" ", "").lower(), user.email.split("@")[0].lower()}


class CommentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = CommentRepository(db)
        self.documents = DocumentRepository(db)
        self.workspaces = WorkspaceRepository(db)
        self.users = UserRepository(db)
        self.notifications = NotificationService(db)

    async def _get_document_or_404(self, document_id: uuid.UUID):
        doc = await self.documents.get_by_id(document_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return doc

    async def _get_comment_or_404(self, comment_id: uuid.UUID) -> Comment:
        comment = await self.repo.get_by_id(comment_id)
        if comment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        return comment

    async def _serialize(self, comments: list[Comment]) -> list[CommentOut]:
        ids: set[uuid.UUID] = set()
        for c in comments:
            ids.add(c.author_id)
            ids.update(r.author_id for r in c.replies)
        names = await self.repo.user_names(ids)
        return [
            CommentOut(
                id=c.id, document_id=c.document_id, author_id=c.author_id,
                author_name=names.get(c.author_id, "Unknown"), content=c.content,
                range_start=c.range_start, range_end=c.range_end, quote=c.quote,
                resolved=c.resolved, created_at=c.created_at,
                replies=[
                    ReplyOut(
                        id=r.id, author_id=r.author_id, author_name=names.get(r.author_id, "Unknown"),
                        content=r.content, created_at=r.created_at,
                    )
                    for r in c.replies
                ],
            )
            for c in comments
        ]

    async def _notify_mentions(
        self, workspace_id: uuid.UUID, document_id: uuid.UUID, author: User, text: str,
        skip: set[uuid.UUID] | None = None,
    ) -> set[uuid.UUID]:
        """Create a notification for every workspace member @mentioned in `text`. Returns notified ids."""
        tokens = extract_mention_tokens(text)
        if not tokens:
            return set()
        skip = skip or set()
        notified: set[uuid.UUID] = set()
        for member in await self.workspaces.list_members(workspace_id):
            target = member.user
            if target.id == author.id or target.id in skip or target.id in notified:
                continue
            if tokens & user_handles(target):
                await self.notifications.notify_mention(target.id, document_id, author.name)
                notified.add(target.id)
        return notified

    # ------------------------------------------------------------------ public API

    async def create_comment(
        self, document_id: uuid.UUID, user_id: uuid.UUID, content: str,
        range_start: int | None, range_end: int | None, quote: str | None,
    ) -> CommentOut:
        doc = await self._get_document_or_404(document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.COMMENTER)

        if (range_start is None) != (range_end is None) or (
            range_start is not None and range_end is not None and range_end <= range_start
        ):
            raise HTTPException(status_code=422, detail="range_start and range_end must both be set, with end > start")

        author = await self.users.get_by_id(user_id)
        comment = await self.repo.create(document_id, user_id, content, range_start, range_end, quote)
        await self._notify_mentions(doc.workspace_id, document_id, author, content)
        await self.db.commit()

        await publish_document_event(document_id, {"type": "comment_event", "event": "created", "comment_id": str(comment.id)})
        fresh = await self._get_comment_or_404(comment.id)
        return (await self._serialize([fresh]))[0]

    async def list_comments(self, document_id: uuid.UUID, user_id: uuid.UUID) -> list[CommentOut]:
        doc = await self._get_document_or_404(document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.VIEWER)
        return await self._serialize(await self.repo.list_for_document(document_id))

    async def resolve_comment(self, comment_id: uuid.UUID, user_id: uuid.UUID, resolved: bool) -> CommentOut:
        comment = await self._get_comment_or_404(comment_id)
        doc = await self._get_document_or_404(comment.document_id)
        # Commenters may resolve/reopen their own comments; editors+ may resolve any.
        membership = await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.COMMENTER)
        if not (membership.role in (WorkspaceRole.EDITOR, WorkspaceRole.OWNER) or comment.author_id == user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot resolve another user's comment")
        await self.repo.set_resolved(comment, resolved)
        await self.db.commit()

        await publish_document_event(doc.id, {
            "type": "comment_event", "event": "resolved" if resolved else "reopened", "comment_id": str(comment.id),
        })
        fresh = await self._get_comment_or_404(comment_id)
        return (await self._serialize([fresh]))[0]

    async def add_reply(self, comment_id: uuid.UUID, user_id: uuid.UUID, content: str) -> ReplyOut:
        comment = await self._get_comment_or_404(comment_id)
        doc = await self._get_document_or_404(comment.document_id)
        await require_role(self.db, doc.workspace_id, user_id, WorkspaceRole.COMMENTER)

        author = await self.users.get_by_id(user_id)
        reply: CommentReply = await self.repo.add_reply(comment_id, user_id, content)

        mentioned = await self._notify_mentions(doc.workspace_id, doc.id, author, content)
        if comment.author_id != user_id and comment.author_id not in mentioned:
            await self.notifications.notify_comment_reply(comment.author_id, doc.id, author.name)
        await self.db.commit()

        await publish_document_event(doc.id, {"type": "comment_event", "event": "replied", "comment_id": str(comment_id)})
        return ReplyOut(
            id=reply.id, author_id=reply.author_id, author_name=author.name,
            content=reply.content, created_at=reply.created_at,
        )
