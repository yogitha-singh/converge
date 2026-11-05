import pytest

from tests.conftest import auth_headers, invite, make_document, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


async def _setup_doc(client, prefix="c"):
    owner = await register_and_login(client, f"{prefix}owner@example.com", name="Olivia Owner")
    workspace_id = await make_workspace(client, owner, "CWS")
    doc = await make_document(client, owner, workspace_id, content="hello world")
    return owner, workspace_id, doc["id"]


async def test_create_reply_resolve_reopen_comment(client):
    owner, _, doc_id = await _setup_doc(client)

    created = await client.post(
        f"/api/documents/{doc_id}/comments",
        json={"content": "Please clarify", "range_start": 0, "range_end": 5, "quote": "hello"},
        headers=auth_headers(owner),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["resolved"] is False
    assert body["author_name"] == "Olivia Owner"
    assert body["quote"] == "hello"
    comment_id = body["id"]

    reply = await client.post(f"/api/comments/{comment_id}/replies", json={"content": "Sure"}, headers=auth_headers(owner))
    assert reply.status_code == 201
    assert reply.json()["author_name"] == "Olivia Owner"

    listed = await client.get(f"/api/documents/{doc_id}/comments", headers=auth_headers(owner))
    assert len(listed.json()) == 1
    assert len(listed.json()[0]["replies"]) == 1

    assert (await client.post(f"/api/comments/{comment_id}/resolve", headers=auth_headers(owner))).json()["resolved"] is True
    assert (await client.post(f"/api/comments/{comment_id}/reopen", headers=auth_headers(owner))).json()["resolved"] is False


async def test_invalid_comment_range_rejected(client):
    owner, _, doc_id = await _setup_doc(client, "cr")
    for payload in (
        {"content": "x", "range_start": 5, "range_end": 5},
        {"content": "x", "range_start": 9, "range_end": 2},
        {"content": "x", "range_start": 3},
    ):
        resp = await client.post(f"/api/documents/{doc_id}/comments", json=payload, headers=auth_headers(owner))
        assert resp.status_code == 422


async def test_viewer_can_read_but_not_comment(client):
    owner, workspace_id, doc_id = await _setup_doc(client, "cv")
    viewer = await register_and_login(client, "cviewer@example.com")
    await invite(client, owner, workspace_id, "cviewer@example.com", "viewer")

    assert (await client.get(f"/api/documents/{doc_id}/comments", headers=auth_headers(viewer))).status_code == 200
    resp = await client.post(f"/api/documents/{doc_id}/comments", json={"content": "nope"}, headers=auth_headers(viewer))
    assert resp.status_code == 403


async def test_commenter_can_only_resolve_own_comments(client):
    owner, workspace_id, doc_id = await _setup_doc(client, "cres")
    commenter = await register_and_login(client, "cres_commenter@example.com")
    await invite(client, owner, workspace_id, "cres_commenter@example.com", "commenter")

    owners_comment = (await client.post(
        f"/api/documents/{doc_id}/comments", json={"content": "mine"}, headers=auth_headers(owner)
    )).json()
    forbidden = await client.post(f"/api/comments/{owners_comment['id']}/resolve", headers=auth_headers(commenter))
    assert forbidden.status_code == 403

    own = (await client.post(
        f"/api/documents/{doc_id}/comments", json={"content": "theirs"}, headers=auth_headers(commenter)
    )).json()
    assert (await client.post(f"/api/comments/{own['id']}/resolve", headers=auth_headers(commenter))).status_code == 200
    # Editors/owners can resolve anyone's.
    assert (await client.post(f"/api/comments/{own['id']}/reopen", headers=auth_headers(owner))).status_code == 200


async def test_mention_notifies_only_the_mentioned_member(client):
    owner, workspace_id, doc_id = await _setup_doc(client, "cm")
    bish = await register_and_login(client, "bish@example.com", name="Bish")
    sarah = await register_and_login(client, "sarah@example.com", name="Sarah Jones")
    await invite(client, owner, workspace_id, "bish@example.com", "editor")
    await invite(client, owner, workspace_id, "sarah@example.com", "editor")

    # Name-without-spaces handle for Sarah, email-local-part handle for Bish.
    await client.post(
        f"/api/documents/{doc_id}/comments",
        json={"content": "@Bish can you review this? cc @SarahJones"},
        headers=auth_headers(owner),
    )

    bish_notes = (await client.get("/api/notifications", headers=auth_headers(bish))).json()
    mention = next(n for n in bish_notes if n["type"] == "comment_mention")
    assert mention["reference_id"] == doc_id  # deep-links to the document
    assert "Olivia Owner" in mention["message"]

    sarah_notes = (await client.get("/api/notifications", headers=auth_headers(sarah))).json()
    assert any(n["type"] == "comment_mention" for n in sarah_notes)

    # The author is never notified about their own mention.
    owner_notes = (await client.get("/api/notifications", headers=auth_headers(owner))).json()
    assert not any(n["type"] == "comment_mention" for n in owner_notes)


async def test_mention_of_non_member_is_ignored(client):
    owner, _, doc_id = await _setup_doc(client, "cn")
    outsider = await register_and_login(client, "outsider_mention@example.com", name="Zed")

    await client.post(f"/api/documents/{doc_id}/comments", json={"content": "hey @Zed"}, headers=auth_headers(owner))
    notes = (await client.get("/api/notifications", headers=auth_headers(outsider))).json()
    assert notes == []
