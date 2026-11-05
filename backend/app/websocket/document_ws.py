"""
WS /ws/documents/{document_id}?token=<access token>

Flow (see docs/concurrency.md):

    Client --operation--> validate & authorize --> lock row --> check revision --> apply
        --> persist --> publish to Redis --> every instance broadcasts to its local clients

Design notes
- The socket is accepted first and *then* closed with an application code (4401 bad token,
  4403 no access). Closing before accept would surface as an opaque HTTP 403 / code 1006 in
  browsers, and the client could not tell "refresh your token" from "network down".
- Every message gets its own short-lived DB session. A connection can live for hours; sharing
  one session would pin a transaction + identity map for that long and serve stale rows.
- Viewers/commenters may connect (to see edits, presence, cursors) but cannot send operations;
  that is enforced in DocumentService, not here.
"""
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.api.deps import get_current_user_ws
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.services.document_service import DocumentService, StaleRevisionError
from app.websocket.connection_manager import manager, new_connection_id

logger = logging.getLogger("converge.ws")
router = APIRouter()

MAX_MESSAGE_BYTES = 2_000_000  # ~2 MB: whole-document operations, so this bounds document size


async def _send(websocket: WebSocket, payload: dict) -> None:
    await websocket.send_text(json.dumps(payload))


@router.websocket("/ws/documents/{document_id}")
async def document_websocket(websocket: WebSocket, document_id: uuid.UUID, token: str = Query(...)):
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        user = await get_current_user_ws(token, db)
        if user is None:
            await websocket.close(code=4401)
            return
        try:
            await DocumentService(db).get_document(document_id, user.id)  # enforces membership
        except HTTPException:
            await websocket.close(code=4403)
            return

    doc_key = str(document_id)
    connection_id = new_connection_id()
    await manager.register(doc_key, connection_id, websocket)

    try:
        await manager.touch_presence(doc_key, connection_id, str(user.id), user.name)
        await manager.broadcast_presence(doc_key)

        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_MESSAGE_BYTES:
                await _send(websocket, {"type": "error", "message": "Message too large"})
                continue
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = message.get("type")
            if msg_type == "operation":
                await _handle_operation(websocket, doc_key, document_id, user, message)
            elif msg_type == "cursor":
                await manager.publish(doc_key, {
                    "type": "cursor",
                    "user_id": str(user.id),
                    "name": user.name,
                    "position": message.get("position"),
                    "selection_start": message.get("selection_start"),
                    "selection_end": message.get("selection_end"),
                })
            elif msg_type == "heartbeat":
                await manager.touch_presence(doc_key, connection_id, str(user.id), user.name)
                await manager.broadcast_presence(doc_key)
            else:
                await _send(websocket, {"type": "error", "message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("websocket crashed for doc %s", doc_key)
    finally:
        await manager.unregister(doc_key, connection_id)
        try:
            await manager.broadcast_presence(doc_key)
        except Exception:  # noqa: BLE001
            logger.warning("could not broadcast presence on disconnect", exc_info=True)


async def _handle_operation(websocket: WebSocket, doc_key: str, document_id: uuid.UUID, user: User, message: dict) -> None:
    try:
        base_revision = int(message["base_revision"])
        content = message["content"]
        if not isinstance(content, str):
            raise TypeError("content must be a string")
        title = message.get("title")
        if title is not None and not isinstance(title, str):
            raise TypeError("title must be a string")
        origin = str(message.get("client_id") or "")[:64]
    except (KeyError, TypeError, ValueError):
        await _send(websocket, {"type": "error", "message": "Malformed operation"})
        return

    async with AsyncSessionLocal() as db:
        service = DocumentService(db)
        try:
            doc, changed = await service.apply_operation(document_id, user.id, base_revision, content, title)
        except StaleRevisionError:
            # Only the sender needs to resync. Send the authoritative state so it can rebase.
            current = await service.get_document(document_id, user.id)
            await _send(websocket, {
                "type": "stale_revision",
                "current_revision": current.revision,
                "current_content": current.content,
                "current_title": current.title,
            })
            return
        except HTTPException as exc:
            await _send(websocket, {"type": "error", "code": exc.status_code, "message": exc.detail})
            return
        except Exception:  # noqa: BLE001
            logger.exception("failed to apply operation")
            await _send(websocket, {"type": "error", "message": "Internal error applying operation"})
            return

    if not changed:
        await _send(websocket, {"type": "ack", "revision": doc.revision})
        return

    # Broadcast the authoritative new state to everyone (including the sender, whose client
    # recognises `origin` and only adopts the revision).
    await manager.publish(doc_key, {
        "type": "operation",
        "revision": doc.revision,
        "content": doc.content,
        "title": doc.title,
        "edited_by": str(user.id),
        "edited_by_name": user.name,
        "origin": origin,
    })
