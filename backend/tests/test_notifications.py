import pytest

from tests.conftest import auth_headers, register_and_login

pytestmark = pytest.mark.asyncio


async def test_workspace_invite_creates_notification(client):
    owner = await register_and_login(client, "ninviter@example.com")
    invitee_email = "ninvitee@example.com"
    await register_and_login(client, invitee_email)

    ws = await client.post("/api/workspaces", json={"name": "NotifyWS"}, headers=auth_headers(owner))
    workspace_id = ws.json()["id"]
    await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": invitee_email, "role": "editor"},
        headers=auth_headers(owner),
    )

    invitee_token = await register_and_login(client, invitee_email)
    notifications = await client.get("/api/notifications", headers=auth_headers(invitee_token))
    assert notifications.status_code == 200
    types = [n["type"] for n in notifications.json()]
    assert "workspace_invite" in types


async def test_mark_notification_read(client):
    owner = await register_and_login(client, "nreader_owner@example.com")
    invitee_email = "nreader_invitee@example.com"
    await register_and_login(client, invitee_email)

    ws = await client.post("/api/workspaces", json={"name": "ReadWS"}, headers=auth_headers(owner))
    workspace_id = ws.json()["id"]
    await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": invitee_email, "role": "viewer"},
        headers=auth_headers(owner),
    )

    invitee_token = await register_and_login(client, invitee_email)
    unread_before = await client.get("/api/notifications?unread_only=true", headers=auth_headers(invitee_token))
    assert len(unread_before.json()) >= 1
    notification_id = unread_before.json()[0]["id"]

    marked = await client.post(f"/api/notifications/{notification_id}/read", headers=auth_headers(invitee_token))
    assert marked.status_code == 200
    assert marked.json()["read"] is True

    unread_after = await client.get("/api/notifications?unread_only=true", headers=auth_headers(invitee_token))
    assert all(n["id"] != notification_id for n in unread_after.json())


async def test_reply_to_comment_notifies_original_author(client):
    owner = await register_and_login(client, "creply_owner@example.com")
    replier_email = "creply_replier@example.com"
    await register_and_login(client, replier_email)

    ws = await client.post("/api/workspaces", json={"name": "ReplyWS"}, headers=auth_headers(owner))
    workspace_id = ws.json()["id"]
    await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": replier_email, "role": "commenter"},
        headers=auth_headers(owner),
    )
    doc = await client.post(
        "/api/documents",
        json={"workspace_id": workspace_id, "title": "D", "content": "hi"},
        headers=auth_headers(owner),
    )
    comment = await client.post(
        f"/api/documents/{doc.json()['id']}/comments",
        json={"content": "Original comment"},
        headers=auth_headers(owner),
    )

    replier_token = await register_and_login(client, replier_email)
    reply = await client.post(
        f"/api/comments/{comment.json()['id']}/replies",
        json={"content": "A reply"},
        headers=auth_headers(replier_token),
    )
    assert reply.status_code == 201

    owner_notifications = await client.get("/api/notifications", headers=auth_headers(owner))
    types = [n["type"] for n in owner_notifications.json()]
    assert "comment_reply" in types


async def test_cannot_read_another_users_notification(client):
    owner = await register_and_login(client, "nsteal_owner@example.com")
    victim_email = "nsteal_victim@example.com"
    await register_and_login(client, victim_email)
    attacker_token = await register_and_login(client, "nsteal_attacker@example.com")

    ws = await client.post("/api/workspaces", json={"name": "StealWS"}, headers=auth_headers(owner))
    workspace_id = ws.json()["id"]
    await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": victim_email, "role": "viewer"},
        headers=auth_headers(owner),
    )

    victim_token = await register_and_login(client, victim_email)
    victim_notifications = await client.get("/api/notifications", headers=auth_headers(victim_token))
    notification_id = victim_notifications.json()[0]["id"]

    resp = await client.post(f"/api/notifications/{notification_id}/read", headers=auth_headers(attacker_token))
    assert resp.status_code == 404
