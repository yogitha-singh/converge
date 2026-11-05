import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _create(self, user_id: uuid.UUID, type_: NotificationType, message: str, reference_id: uuid.UUID | None):
        note = Notification(user_id=user_id, type=type_, message=message, reference_id=reference_id)
        self.db.add(note)
        await self.db.flush()
        return note

    async def notify_workspace_invite(self, user_id: uuid.UUID, workspace_id: uuid.UUID, workspace_name: str = ""):
        suffix = f' "{workspace_name}"' if workspace_name else ""
        return await self._create(
            user_id, NotificationType.WORKSPACE_INVITE, f"You were added to the workspace{suffix}", workspace_id
        )

    async def notify_document_added(self, user_id: uuid.UUID, document_id: uuid.UUID):
        return await self._create(
            user_id, NotificationType.DOCUMENT_ADDED, "You were given access to a document", document_id
        )

    async def notify_comment_reply(self, user_id: uuid.UUID, document_id: uuid.UUID, actor_name: str = "Someone"):
        return await self._create(
            user_id, NotificationType.COMMENT_REPLY, f"{actor_name} replied to your comment", document_id
        )

    async def notify_mention(self, user_id: uuid.UUID, document_id: uuid.UUID, actor_name: str):
        return await self._create(
            user_id, NotificationType.COMMENT_MENTION, f"{actor_name} mentioned you in a comment", document_id
        )

    async def list_for_user(self, user_id: uuid.UUID, unread_only: bool = False) -> list[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.read.is_(False))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(100)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_read(self, notification: Notification) -> Notification:
        notification.read = True
        await self.db.flush()
        return notification
