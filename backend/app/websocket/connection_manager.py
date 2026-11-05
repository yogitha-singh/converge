"""
Manages WebSocket connections for document "rooms".

Two layers of state:
1. In-process: which local WebSocket objects are subscribed to which document, so we
   can push to them directly.
2. Redis: presence (who is viewing which document + heartbeat) and one pub/sub channel per
   document, so an event published on ANY backend instance reaches clients connected to
   EVERY instance. That is what lets the architecture scale horizontally.

Presence is keyed per *connection* (not per user), so a user with two tabs open stays
"online" until both close, and the client list is de-duplicated by user on read.
"""
import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict

from fastapi import WebSocket
from redis.asyncio.client import PubSub

from app.core.redis_client import doc_room_channel, get_redis, presence_key

logger = logging.getLogger("converge.ws")

HEARTBEAT_INTERVAL_SECONDS = 15
PRESENCE_STALE_SECONDS = 45  # three missed heartbeats


class ConnectionManager:
    def __init__(self) -> None:
        # document_id -> {connection_id: WebSocket}
        self._rooms: dict[str, dict[str, WebSocket]] = defaultdict(dict)
        self._listeners: dict[str, tuple[PubSub, asyncio.Task]] = {}
        self._lock = asyncio.Lock()

    # ----------------------------------------------------------- connections

    async def register(self, document_id: str, connection_id: str, websocket: WebSocket) -> None:
        """Track an already-accepted socket and make sure we're subscribed to the doc channel."""
        self._rooms[document_id][connection_id] = websocket
        await self._ensure_listener(document_id)

    async def unregister(self, document_id: str, connection_id: str) -> None:
        room = self._rooms.get(document_id)
        if room is not None:
            room.pop(connection_id, None)
            if not room:
                self._rooms.pop(document_id, None)
                await self._drop_listener(document_id)
        try:
            await get_redis().hdel(presence_key(document_id), connection_id)
        except Exception:  # noqa: BLE001
            logger.warning("could not clear presence for %s", connection_id, exc_info=True)

    async def _ensure_listener(self, document_id: str) -> None:
        async with self._lock:
            if document_id in self._listeners:
                return
            pubsub = get_redis().pubsub()
            # Await the subscription BEFORE returning, otherwise the very first presence/operation
            # broadcast can be published before we're listening and the joiner never sees it.
            await pubsub.subscribe(doc_room_channel(document_id))
            task = asyncio.create_task(self._listen(document_id, pubsub))
            self._listeners[document_id] = (pubsub, task)

    async def _drop_listener(self, document_id: str) -> None:
        async with self._lock:
            entry = self._listeners.pop(document_id, None)
        if entry is None:
            return
        pubsub, task = entry
        task.cancel()
        try:
            await pubsub.unsubscribe(doc_room_channel(document_id))
            await pubsub.aclose()
        except Exception:  # noqa: BLE001
            pass

    async def _listen(self, document_id: str, pubsub: PubSub) -> None:
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                await self.local_broadcast(document_id, json.loads(message["data"]))
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: BLE001
            logger.exception("pubsub listener for %s crashed", document_id)

    # ----------------------------------------------------------- fan-out

    async def local_broadcast(self, document_id: str, message: dict) -> None:
        payload = json.dumps(message)
        room = self._rooms.get(document_id, {})
        dead = []
        for conn_id, ws in list(room.items()):
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001
                dead.append(conn_id)
        for conn_id in dead:
            room.pop(conn_id, None)

    async def publish(self, document_id: str, message: dict) -> None:
        """Publish to Redis so every backend instance (including this one) fans it out."""
        await get_redis().publish(doc_room_channel(document_id), json.dumps(message, default=str))

    # ----------------------------------------------------------- presence (ephemeral, Redis)

    async def touch_presence(self, document_id: str, connection_id: str, user_id: str, name: str) -> None:
        redis = get_redis()
        entry = json.dumps({"user_id": user_id, "name": name, "last_seen": time.time()})
        await redis.hset(presence_key(document_id), connection_id, entry)
        await redis.expire(presence_key(document_id), PRESENCE_STALE_SECONDS * 4)

    async def get_presence(self, document_id: str) -> list[dict]:
        redis = get_redis()
        raw = await redis.hgetall(presence_key(document_id))
        now = time.time()
        by_user: dict[str, dict] = {}
        stale: list[str] = []
        for connection_id, entry in raw.items():
            data = json.loads(entry)
            if now - data["last_seen"] > PRESENCE_STALE_SECONDS:
                stale.append(connection_id)
                continue
            existing = by_user.get(data["user_id"])
            if existing is None or data["last_seen"] > existing["last_seen"]:
                by_user[data["user_id"]] = data
        if stale:
            await redis.hdel(presence_key(document_id), *stale)
        return sorted(by_user.values(), key=lambda d: d["name"].lower())

    async def broadcast_presence(self, document_id: str) -> None:
        await self.publish(document_id, {"type": "presence", "users": await self.get_presence(document_id)})


manager = ConnectionManager()


def new_connection_id() -> str:
    return str(uuid.uuid4())
