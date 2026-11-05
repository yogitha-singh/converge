"""
Publish realtime events to every client viewing a document (across all backend instances).

Used by REST-side services (comments, workflow changes) so that a change made through an
HTTP request is pushed to open editors over WebSocket. A Redis outage must never fail the
HTTP request that triggered the event, so errors are logged and swallowed.
"""
import json
import logging
import uuid

from app.core.redis_client import doc_room_channel, get_redis

logger = logging.getLogger("converge.realtime")


async def publish_document_event(document_id: uuid.UUID | str, payload: dict) -> None:
    try:
        await get_redis().publish(doc_room_channel(str(document_id)), json.dumps(payload, default=str))
    except Exception:  # noqa: BLE001 - best-effort fan-out
        logger.warning("failed to publish realtime event %s", payload.get("type"), exc_info=True)
