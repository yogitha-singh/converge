"""
Shared async Redis client.

Redis is the source of truth for *ephemeral* state only:
- presence (who is online, in which document, last heartbeat)
- pub/sub channels used to fan realtime events out across backend instances

It must never be treated as durable storage -- PostgreSQL owns that.

The client is cached per running event loop. In production there is exactly one
loop so this is a plain singleton; in tests (several loops) it avoids the classic
"attached to a different loop" failure.
"""
import asyncio

from redis.asyncio import Redis, from_url

from app.core.config import get_settings

settings = get_settings()

_clients: dict[int, tuple[asyncio.AbstractEventLoop, Redis]] = {}


def get_redis() -> Redis:
    loop = asyncio.get_running_loop()
    entry = _clients.get(id(loop))
    if entry is None or entry[0] is not loop:
        client = from_url(settings.REDIS_URL, decode_responses=True)
        _clients[id(loop)] = (loop, client)
        return client
    return entry[1]


async def close_redis() -> None:
    loop = asyncio.get_running_loop()
    entry = _clients.pop(id(loop), None)
    if entry is not None:
        await entry[1].aclose()


# --- Key naming conventions (centralized so they don't drift) ---

def presence_key(document_id: str) -> str:
    return f"presence:doc:{document_id}"


def doc_room_channel(document_id: str) -> str:
    return f"channel:doc:{document_id}"
