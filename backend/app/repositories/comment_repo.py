import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.comment import Comment, CommentReply
from app.models.user import User


class CommentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self, document_id: uuid.UUID, author_id: uuid.UUID, content: str,
        range_start: int | None, range_end: int | None, quote: str | None,
    ) -> Comment:
        comment = Comment(
            document_id=document_id, author_id=author_id, content=content,
            range_start=range_start, range_end=range_end, quote=quote,
        )
        self.db.add(comment)
        await self.db.flush()
        return comment

    async def get_by_id(self, comment_id: uuid.UUID) -> Comment | None:
        result = await self.db.execute(
            select(Comment)
            .options(selectinload(Comment.replies))
            .where(Comment.id == comment_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_for_document(self, document_id: uuid.UUID) -> list[Comment]:
        result = await self.db.execute(
            select(Comment)
            .options(selectinload(Comment.replies))
            .where(Comment.document_id == document_id)
            .order_by(Comment.created_at.asc())
            .execution_options(populate_existing=True)
        )
        return list(result.scalars().all())

    async def set_resolved(self, comment: Comment, resolved: bool) -> Comment:
        comment.resolved = resolved
        await self.db.flush()
        return comment

    async def add_reply(self, comment_id: uuid.UUID, author_id: uuid.UUID, content: str) -> CommentReply:
        reply = CommentReply(comment_id=comment_id, author_id=author_id, content=content)
        self.db.add(reply)
        await self.db.flush()
        return reply

    async def user_names(self, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not user_ids:
            return {}
        rows = await self.db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))
        return {uid: name for uid, name in rows.all()}
