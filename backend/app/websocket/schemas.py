"""
Message envelope shapes exchanged over the /ws/documents/{document_id} socket.

Every inbound message has a `type` discriminator. Server -> client messages
follow the same convention so a single dispatcher can handle both directions.
"""
from typing import Any, Literal

from pydantic import BaseModel


class ClientOperation(BaseModel):
    """A single editing operation submitted by a client."""
    type: Literal["operation"] = "operation"
    base_revision: int
    content: str
    title: str | None = None


class ClientCursor(BaseModel):
    type: Literal["cursor"] = "cursor"
    position: int | None = None
    selection_start: int | None = None
    selection_end: int | None = None


class ClientHeartbeat(BaseModel):
    type: Literal["heartbeat"] = "heartbeat"


class ClientJoin(BaseModel):
    type: Literal["join"] = "join"


# --- Server -> client ---

class ServerOperationAck(BaseModel):
    type: Literal["operation_ack"] = "operation_ack"
    revision: int


class ServerOperationBroadcast(BaseModel):
    type: Literal["operation"] = "operation"
    revision: int
    content: str
    title: str | None
    edited_by: str
    edited_by_name: str


class ServerStaleRevision(BaseModel):
    type: Literal["stale_revision"] = "stale_revision"
    current_revision: int
    current_content: str
    current_title: str


class ServerPresenceUpdate(BaseModel):
    type: Literal["presence"] = "presence"
    users: list[dict[str, Any]]


class ServerCursorBroadcast(BaseModel):
    type: Literal["cursor"] = "cursor"
    user_id: str
    name: str
    position: int | None
    selection_start: int | None
    selection_end: int | None


class ServerError(BaseModel):
    type: Literal["error"] = "error"
    message: str
