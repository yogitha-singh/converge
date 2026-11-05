"""
End-to-end tests of the real WebSocket endpoint (needs Postgres + Redis, as provided by
docker-compose / CI). Starlette's sync TestClient drives the sockets; using it as a context
manager keeps ONE event loop alive so several connections can share the in-process manager.
"""
import json

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from tests.conftest import auth_headers, invite, make_document, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


def ws_url(doc_id: str, token: str) -> str:
    return f"/ws/documents/{doc_id}?token={token}"


def recv_until(ws, wanted: str, limit: int = 10) -> dict:
    """Read messages until one of type `wanted` arrives (presence updates may interleave)."""
    for _ in range(limit):
        message = json.loads(ws.receive_text())
        if message["type"] == wanted:
            return message
    raise AssertionError(f"never received a {wanted!r} message")


def send_op(ws, base_revision: int, content: str, **extra) -> None:
    ws.send_text(json.dumps({"type": "operation", "base_revision": base_revision, "content": content, **extra}))


async def _setup(client, email="wsuser@example.com"):
    token = await register_and_login(client, email)
    workspace_id = await make_workspace(client, token, "WSWorkspace")
    doc = await make_document(client, token, workspace_id, title="WSDoc", content="start")
    return token, workspace_id, doc


async def test_missing_token_is_rejected(client):
    _, _, doc = await _setup(client)
    with TestClient(app) as tc:
        with pytest.raises(Exception):
            with tc.websocket_connect(f"/ws/documents/{doc['id']}"):
                pass


async def test_invalid_token_closes_with_4401(client):
    _, _, doc = await _setup(client, "ws_badtoken@example.com")
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], "not-a-jwt")) as ws:
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_text()
            assert exc.value.code == 4401


async def test_non_member_closes_with_4403(client):
    _, _, doc = await _setup(client, "ws_owner403@example.com")
    outsider = await register_and_login(client, "ws_outsider@example.com")
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], outsider)) as ws:
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_text()
            assert exc.value.code == 4403


async def test_operation_is_applied_persisted_and_echoed_with_origin(client):
    token, _, doc = await _setup(client, "ws_op@example.com")
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], token)) as ws:
            assert recv_until(ws, "presence")["users"][0]["name"]

            send_op(ws, 0, "updated live", client_id="tab-1")
            op = recv_until(ws, "operation")
            assert op["revision"] == 1
            assert op["content"] == "updated live"
            assert op["origin"] == "tab-1"

    check = await client.get(f"/api/documents/{doc['id']}", headers=auth_headers(token))
    assert check.json()["content"] == "updated live"
    assert check.json()["revision"] == 1


async def test_operation_is_broadcast_to_other_collaborators(client):
    owner, workspace_id, doc = await _setup(client, "ws_bc_owner@example.com")
    editor = await register_and_login(client, "ws_bc_editor@example.com", name="Eddie")
    await invite(client, owner, workspace_id, "ws_bc_editor@example.com", "editor")

    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], owner)) as ws_a, tc.websocket_connect(ws_url(doc["id"], editor)) as ws_b:
            recv_until(ws_a, "presence")
            both = recv_until(ws_b, "presence")
            assert len(both["users"]) >= 1

            send_op(ws_a, 0, "typed by A", client_id="a")
            seen_by_b = recv_until(ws_b, "operation")
            assert seen_by_b["content"] == "typed by A"
            assert seen_by_b["origin"] == "a"


async def test_cursor_events_are_relayed(client):
    owner, workspace_id, doc = await _setup(client, "ws_cur_owner@example.com")
    editor = await register_and_login(client, "ws_cur_editor@example.com", name="Cursor Carl")
    await invite(client, owner, workspace_id, "ws_cur_editor@example.com", "editor")

    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], owner)) as ws_a, tc.websocket_connect(ws_url(doc["id"], editor)) as ws_b:
            recv_until(ws_a, "presence")
            recv_until(ws_b, "presence")
            ws_b.send_text(json.dumps({"type": "cursor", "position": 3, "selection_start": 3, "selection_end": 3}))
            cursor = recv_until(ws_a, "cursor")
            assert cursor["name"] == "Cursor Carl"
            assert cursor["position"] == 3


async def test_stale_operation_gets_authoritative_state_back(client):
    token, _, doc = await _setup(client, "ws_stale@example.com")
    await client.patch(
        f"/api/documents/{doc['id']}", json={"content": "server-side edit", "revision": 0}, headers=auth_headers(token)
    )
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], token)) as ws:
            recv_until(ws, "presence")
            send_op(ws, 0, "stale write")  # client still believes revision 0
            stale = recv_until(ws, "stale_revision")
            assert stale["current_revision"] == 1
            assert stale["current_content"] == "server-side edit"

    check = await client.get(f"/api/documents/{doc['id']}", headers=auth_headers(token))
    assert check.json()["content"] == "server-side edit"  # the stale write did not clobber anything


async def test_noop_operation_is_acked_without_new_revision(client):
    token, _, doc = await _setup(client, "ws_noop@example.com")
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], token)) as ws:
            recv_until(ws, "presence")
            send_op(ws, 0, "start", title="WSDoc")  # identical content and title
            ack = recv_until(ws, "ack")
            assert ack["revision"] == 0


async def test_viewer_can_watch_but_not_edit(client):
    owner, workspace_id, doc = await _setup(client, "ws_view_owner@example.com")
    viewer = await register_and_login(client, "ws_viewer@example.com")
    await invite(client, owner, workspace_id, "ws_viewer@example.com", "viewer")

    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], viewer)) as ws:
            recv_until(ws, "presence")  # connecting is allowed
            send_op(ws, 0, "viewer edit")
            error = recv_until(ws, "error")
            assert error["code"] == 403

    check = await client.get(f"/api/documents/{doc['id']}", headers=auth_headers(owner))
    assert check.json()["content"] == "start"


async def test_archived_document_rejects_live_edits(client):
    token, _, doc = await _setup(client, "ws_arch@example.com")
    await client.patch(f"/api/documents/{doc['id']}/meta", json={"status": "archived"}, headers=auth_headers(token))
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], token)) as ws:
            recv_until(ws, "presence")
            send_op(ws, 0, "edit archived")
            error = recv_until(ws, "error")
            assert error["code"] == 409
            assert error["message"]["error"] == "DOCUMENT_ARCHIVED"


async def test_workflow_change_is_pushed_to_open_editors(client):
    token, _, doc = await _setup(client, "ws_meta@example.com")
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], token)) as ws:
            recv_until(ws, "presence")
            await client.patch(f"/api/documents/{doc['id']}/meta", json={"status": "in_review"}, headers=auth_headers(token))
            meta = recv_until(ws, "meta")
            assert meta["status"] == "in_review"


async def test_new_comment_is_pushed_to_open_editors(client):
    token, _, doc = await _setup(client, "ws_comment@example.com")
    with TestClient(app) as tc:
        with tc.websocket_connect(ws_url(doc["id"], token)) as ws:
            recv_until(ws, "presence")
            await client.post(f"/api/documents/{doc['id']}/comments", json={"content": "live!"}, headers=auth_headers(token))
            event = recv_until(ws, "comment_event")
            assert event["event"] == "created"
