import pytest

from tests.conftest import auth_headers, invite, make_document, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


async def _edit(client, token, doc_id, content, revision):
    resp = await client.patch(
        f"/api/documents/{doc_id}", json={"content": content, "revision": revision}, headers=auth_headers(token)
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["revision"]


async def _versions(client, token, doc_id):
    return (await client.get(f"/api/documents/{doc_id}/versions", headers=auth_headers(token))).json()


async def test_rapid_edits_by_same_user_coalesce_into_one_session(client):
    token = await register_and_login(client, "ver1@example.com")
    ws = await make_workspace(client, token)
    doc = await make_document(client, token, ws, content="v0")

    rev = await _edit(client, token, doc["id"], "a", 0)
    rev = await _edit(client, token, doc["id"], "ab", rev)
    rev = await _edit(client, token, doc["id"], "abc", rev)
    assert rev == 3  # revision counter still counts every accepted operation

    versions = await _versions(client, token, doc["id"])
    assert [v["revision"] for v in versions] == [3, 0]  # seed + ONE editing session

    detail = await client.get(f"/api/documents/{doc['id']}/versions/{versions[0]['id']}", headers=auth_headers(token))
    assert detail.json()["content"] == "abc"  # the session holds the latest state of the burst


async def test_different_editors_get_separate_versions(client):
    owner = await register_and_login(client, "ver2_owner@example.com")
    editor = await register_and_login(client, "ver2_editor@example.com", name="Eddie Editor")
    ws = await make_workspace(client, owner)
    await invite(client, owner, ws, "ver2_editor@example.com", "editor")
    doc = await make_document(client, owner, ws)

    rev = await _edit(client, owner, doc["id"], "by owner", 0)
    await _edit(client, editor, doc["id"], "by editor", rev)

    versions = await _versions(client, owner, doc["id"])
    assert [v["revision"] for v in versions] == [2, 1, 0]
    assert versions[0]["edited_by_name"] == "Eddie Editor"


async def test_restore_appends_new_revision_and_keeps_history(client):
    token = await register_and_login(client, "ver3@example.com")
    ws = await make_workspace(client, token)
    doc = await make_document(client, token, ws, content="original")
    await _edit(client, token, doc["id"], "changed", 0)

    seed = next(v for v in await _versions(client, token, doc["id"]) if v["revision"] == 0)
    restored = await client.post(
        f"/api/documents/{doc['id']}/restore", json={"version_id": seed["id"]}, headers=auth_headers(token)
    )
    assert restored.status_code == 200
    assert restored.json()["content"] == "original"
    assert restored.json()["revision"] == 2

    revisions = [v["revision"] for v in await _versions(client, token, doc["id"])]
    assert revisions == [2, 1, 0]  # nothing rewritten, restore is its own entry


async def test_cannot_restore_version_from_another_document(client):
    token = await register_and_login(client, "ver4@example.com")
    ws = await make_workspace(client, token)
    doc_a = await make_document(client, token, ws, title="A")
    doc_b = await make_document(client, token, ws, title="B")
    seed_b = (await _versions(client, token, doc_b["id"]))[0]

    resp = await client.post(
        f"/api/documents/{doc_a['id']}/restore", json={"version_id": seed_b["id"]}, headers=auth_headers(token)
    )
    assert resp.status_code == 404


async def test_viewer_can_read_history_but_not_restore(client):
    owner = await register_and_login(client, "ver5_owner@example.com")
    viewer = await register_and_login(client, "ver5_viewer@example.com")
    ws = await make_workspace(client, owner)
    await invite(client, owner, ws, "ver5_viewer@example.com", "viewer")
    doc = await make_document(client, owner, ws)

    versions = await _versions(client, viewer, doc["id"])
    assert versions
    resp = await client.post(
        f"/api/documents/{doc['id']}/restore", json={"version_id": versions[0]["id"]}, headers=auth_headers(viewer)
    )
    assert resp.status_code == 403
