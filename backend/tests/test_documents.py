import pytest

from tests.conftest import auth_headers, invite, make_document, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


async def _setup(client, email="owner@example.com"):
    token = await register_and_login(client, email)
    workspace_id = await make_workspace(client, token)
    doc = await make_document(client, token, workspace_id)
    return token, workspace_id, doc


async def test_create_and_fetch_document(client):
    token, _, doc = await _setup(client, "docowner1@example.com")
    assert doc["revision"] == 0
    assert doc["content"] == "v0"
    assert doc["status"] == "draft"
    assert doc["doc_type"] == "spec"

    resp = await client.get(f"/api/documents/{doc['id']}", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Doc"
    assert resp.json()["my_role"] == "owner"


async def test_update_document_increments_revision_and_writes_version(client):
    token, _, doc = await _setup(client, "docowner2@example.com")

    update = await client.patch(
        f"/api/documents/{doc['id']}", json={"content": "v1", "revision": 0}, headers=auth_headers(token)
    )
    assert update.status_code == 200
    assert update.json()["revision"] == 1

    versions = await client.get(f"/api/documents/{doc['id']}/versions", headers=auth_headers(token))
    revisions = [v["revision"] for v in versions.json()]
    assert 1 in revisions and 0 in revisions
    assert versions.json()[0]["edited_by_name"]


async def test_stale_revision_rejected(client):
    """Two clients edit from the same base revision: the second must get 409 + the current revision."""
    token, _, doc = await _setup(client, "docowner3@example.com")

    first = await client.patch(
        f"/api/documents/{doc['id']}", json={"content": "from A", "revision": 0}, headers=auth_headers(token)
    )
    assert first.status_code == 200

    second = await client.patch(
        f"/api/documents/{doc['id']}", json={"content": "from B", "revision": 0}, headers=auth_headers(token)
    )
    assert second.status_code == 409
    assert second.json()["detail"]["error"] == "STALE_REVISION"
    assert second.json()["detail"]["current_revision"] == 1


async def test_commenter_cannot_edit_but_can_comment(client):
    owner = await register_and_login(client, "docowner5@example.com")
    commenter = await register_and_login(client, "commenter5@example.com")
    workspace_id = await make_workspace(client, owner)
    await invite(client, owner, workspace_id, "commenter5@example.com", "commenter")
    doc = await make_document(client, owner, workspace_id)

    edit = await client.patch(
        f"/api/documents/{doc['id']}", json={"content": "hacked", "revision": 0}, headers=auth_headers(commenter)
    )
    assert edit.status_code == 403

    comment = await client.post(
        f"/api/documents/{doc['id']}/comments", json={"content": "nice doc"}, headers=auth_headers(commenter)
    )
    assert comment.status_code == 201


async def test_cannot_access_document_in_another_workspace(client):
    owner = await register_and_login(client, "iso_owner@example.com")
    outsider = await register_and_login(client, "iso_outsider@example.com")
    workspace_id = await make_workspace(client, owner)
    doc = await make_document(client, owner, workspace_id)

    # Changing the id in the URL must never leak or mutate another workspace's document.
    for method, path, body in [
        ("get", f"/api/documents/{doc['id']}", None),
        ("patch", f"/api/documents/{doc['id']}", {"content": "x", "revision": 0}),
        ("patch", f"/api/documents/{doc['id']}/meta", {"status": "in_review"}),
        ("get", f"/api/documents/{doc['id']}/versions", None),
        ("get", f"/api/documents/{doc['id']}/comments", None),
        ("delete", f"/api/documents/{doc['id']}", None),
    ]:
        resp = await getattr(client, method)(path, headers=auth_headers(outsider), **({"json": body} if body else {}))
        assert resp.status_code == 404, f"{method} {path} -> {resp.status_code}"


async def test_only_owner_can_delete_document(client):
    owner = await register_and_login(client, "del_owner@example.com")
    editor = await register_and_login(client, "del_editor@example.com")
    workspace_id = await make_workspace(client, owner)
    await invite(client, owner, workspace_id, "del_editor@example.com", "editor")
    doc = await make_document(client, owner, workspace_id)

    assert (await client.delete(f"/api/documents/{doc['id']}", headers=auth_headers(editor))).status_code == 403
    assert (await client.delete(f"/api/documents/{doc['id']}", headers=auth_headers(owner))).status_code == 204


async def test_list_documents_filters_and_paginates(client):
    token = await register_and_login(client, "list_owner@example.com")
    workspace_id = await make_workspace(client, token)
    for i in range(5):
        await make_document(client, token, workspace_id, title=f"Doc {i}", content="needle" if i == 3 else "hay")

    page1 = await client.get(f"/api/documents?workspace_id={workspace_id}&limit=2", headers=auth_headers(token))
    page2 = await client.get(f"/api/documents?workspace_id={workspace_id}&limit=2&offset=2", headers=auth_headers(token))
    assert len(page1.json()) == 2 and len(page2.json()) == 2
    assert not {d["id"] for d in page1.json()} & {d["id"] for d in page2.json()}

    by_content = await client.get(f"/api/documents?workspace_id={workspace_id}&search=needle", headers=auth_headers(token))
    assert [d["title"] for d in by_content.json()] == ["Doc 3"]

    await client.patch(f"/api/documents/{page1.json()[0]['id']}/meta", json={"status": "in_review"}, headers=auth_headers(token))
    in_review = await client.get(f"/api/documents?workspace_id={workspace_id}&status=in_review", headers=auth_headers(token))
    assert len(in_review.json()) == 1
