"""
Asynchronous activity-log writer.

Why: audit entries are important but must never slow down or fail the request that
caused them. Services call ActivityService.log(...), which -- when the worker is
running -- only stashes the event on the DB session. A SQLAlchemy `after_commit` hook
hands the events to an in-process queue *only if the business transaction committed*
(so we never log things that were rolled back), and a background task persists them
in its own short transactions.

Trade-off (documented in docs/architecture.md): events still queued when the process is
killed hard are lost. For stronger guarantees swap the queue for a transactional outbox
table or Redis Streams -- the ActivityService interface would not change.
"""
import asyncio
import logging

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.database import AsyncSessionLocal
from app.models.activity import ActivityLog

logger = logging.getLogger("converge.activity")

PENDING_KEY = "pending_activity"


class ActivityRecorder:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[dict] | None = None
        self._task: asyncio.Task | None = None

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._queue = asyncio.Queue()
        self._task = asyncio.create_task(self._run(), name="activity-recorder")

    async def stop(self) -> None:
        """Drain everything already queued, then stop."""
        if self._queue is not None and self.running:
            await self._queue.join()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._queue = None

    def enqueue(self, event_data: dict) -> None:
        if self._queue is not None:
            self._queue.put_nowait(event_data)

    async def _run(self) -> None:
        assert self._queue is not None
        queue = self._queue
        while True:
            event_data = await queue.get()
            try:
                async with AsyncSessionLocal() as session:
                    session.add(ActivityLog(**event_data))
                    await session.commit()
            except Exception:  # noqa: BLE001
                logger.exception("failed to persist activity event %s", event_data.get("action"))
            finally:
                queue.task_done()


recorder = ActivityRecorder()


@event.listens_for(Session, "after_commit")
def _dispatch_pending_activity(session: Session) -> None:
    events = session.info.pop(PENDING_KEY, None)
    for item in events or []:
        recorder.enqueue(item)


@event.listens_for(Session, "after_rollback")
def _discard_pending_activity(session: Session) -> None:
    session.info.pop(PENDING_KEY, None)
