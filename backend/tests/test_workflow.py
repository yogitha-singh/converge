import pytest

from tests.conftest import auth_headers, invite, make_document, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


async def _setup(client, prefix):
    owner = await register_and_login(client, f"{prefix}_owner@example.com", name=f"{prefix.title()} Owner")
    editor = await register_and_login(client, f"{prefix}_editor@example.com")
    workspace_id = await make_workspace(client, owner)
    await invite(client, owner, workspace_id, f"{prefix}_editor@example.com", "editor")
    doc = await make_document(client, owner, workspace_id, doc_type="rfc")
    return owner, editor, workspace_id, doc


async def _meta(client, token, doc_id, **body):
    return await client.patch(f"/api/documents/{doc_id}/meta", json=body, headers=auth_headers(token))


async def test_document_type_is_stored_and_changeable(client):
    owner, _, _, doc = await _setup(client, "wf1")
    assert doc["doc_type"] == "rfc"
    resp = await _meta(client, owner, doc["id"], doc_type="sprint_plan")
    assert resp.status_code == 200
    assert resp.json()["doc_type"] == "sprint_plan"


async def test_status_lifecycle_happy_path(client):
    owner, editor, _, doc = await _setup(client, "wf2")
    assert (await _meta(client, editor, doc["id"], status="in_review")).json()["status"] == "in_review"
    assert (await _meta(client, owner, doc["id"], status="approved")).json()["status"] == "approved"
    assert (await _meta(client, owner, doc["id"], status="archived")).json()["status"] == "archived"
    assert (await _meta(client, owner, doc["id"], status="draft")).json()["status"] == "draft"


async def test_invalid_transition_rejected(client):
    owner, _, _, doc = await _setup(client, "wf3")
    resp = await _meta(client, owner, doc["id"], status="approved")  # draft -> approved is not allowed
    assert resp.status_code == 409


async def test_only_owner_can_approve_or_unapprove(client):
    owner, editor, _, doc = await _setup(client, "wf4")
    await _meta(client, editor, doc["id"], status="in_review")
    assert (await _meta(client, editor, doc["id"], status="approved")).status_code == 403
    await _meta(client, owner, doc["id"], status="approved")
    assert (await _meta(client, editor, doc["id"], status="in_review")).status_code == 403


async def test_viewer_cannot_change_workflow(client):
    owner, _, workspace_id, doc = await _setup(client, "wf5")
    viewer = await register_and_login(client, "wf5_viewer@example.com")
    await invite(client, owner, workspace_id, "wf5_viewer@example.com", "viewer")
    assert (await _meta(client, viewer, doc["id"], status="in_review")).status_code == 403


async def test_archived_document_is_read_only(client):
    owner, _, _, doc = await _setup(client, "wf6")
    await _meta(client, owner, doc["id"], status="archived")

    edit = await client.patch(
        f"/api/documents/{doc['id']}", json={"content": "nope", "revision": 0}, headers=auth_headers(owner)
    )
    assert edit.status_code == 409
    assert edit.json()["detail"]["error"] == "DOCUMENT_ARCHIVED"

    versions = await client.get(f"/api/documents/{doc['id']}/versions", headers=auth_headers(owner))
    restore = await client.post(
        f"/api/documents/{doc['id']}/restore", json={"version_id": versions.json()[0]["id"]}, headers=auth_headers(owner)
    )
    assert restore.status_code == 409

    await _meta(client, owner, doc["id"], status="draft")
    ok = await client.patch(f"/api/documents/{doc['id']}", json={"content": "back", "revision": 0}, headers=auth_headers(owner))
    assert ok.status_code == 200


async def test_status_change_appears_in_activity_feed_with_actor_name(client):
    owner, _, workspace_id, doc = await _setup(client, "wf7")
    await _meta(client, owner, doc["id"], status="in_review")
    feed = await client.get(f"/api/workspaces/{workspace_id}/activity", headers=auth_headers(owner))
    assert feed.status_code == 200
    entry = next(e for e in feed.json() if e["action"] == "document.status_changed")
    assert entry["actor_name"] == "Wf7 Owner"
    assert "In Review" in entry["description"]
