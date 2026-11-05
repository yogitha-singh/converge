import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityLog
from app.models.user import User
from app.workers.activity_worker import PENDING_KEY, recorder


class ActivityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self, workspace_id: uuid.UUID, actor_id: uuid.UUID, action: str, description: str,
        document_id: uuid.UUID | None = None,
    ) -> ActivityLog | None:
        """
        Record an audit event.

        With the background recorder running (the normal case) this is O(1) and
        non-blocking: the event rides along on the session and is persisted after the
        caller's transaction commits. Without it (scripts, unit tests) the row is
        written inline in the caller's transaction instead.
        """
        data = dict(
            workspace_id=workspace_id, actor_id=actor_id, action=action,
            description=description, document_id=document_id,
            created_at=datetime.now(timezone.utc),
        )
        if recorder.running:
            self.db.sync_session.info.setdefault(PENDING_KEY, []).append(data)
            return None
        entry = ActivityLog(**data)
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def list_for_workspace(
        self, workspace_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> list[tuple[ActivityLog, str]]:
        result = await self.db.execute(
            select(ActivityLog, User.name)
            .join(User, User.id == ActivityLog.actor_id)
            .where(ActivityLog.workspace_id == workspace_id)
            .order_by(ActivityLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [(entry, name) for entry, name in result.all()]
