import pytest

from tests.conftest import auth_headers, register_and_login

pytestmark = pytest.mark.asyncio


async def test_create_workspace_makes_creator_owner(client):
    token = await register_and_login(client, "owner1@example.com")
    resp = await client.post("/api/workspaces", json={"name": "Engineering"}, headers=auth_headers(token))
    assert resp.status_code == 201
    workspace_id = resp.json()["id"]

    members = await client.get(f"/api/workspaces/{workspace_id}/members", headers=auth_headers(token))
    assert members.status_code == 200
    assert len(members.json()) == 1
    assert members.json()[0]["role"] == "owner"


async def test_non_member_cannot_see_workspace(client):
    owner_token = await register_and_login(client, "owner2@example.com")
    outsider_token = await register_and_login(client, "outsider@example.com")

    resp = await client.post("/api/workspaces", json={"name": "Secret"}, headers=auth_headers(owner_token))
    workspace_id = resp.json()["id"]

    peek = await client.get(f"/api/workspaces/{workspace_id}", headers=auth_headers(outsider_token))
    assert peek.status_code == 404  # not found, not forbidden -- don't confirm existence


async def test_only_owner_can_invite_members(client):
    owner_token = await register_and_login(client, "owner3@example.com")
    editor_token = await register_and_login(client, "editor3@example.com")
    third_person_email = "invitee3@example.com"
    await register_and_login(client, third_person_email)

    ws = await client.post("/api/workspaces", json={"name": "Team"}, headers=auth_headers(owner_token))
    workspace_id = ws.json()["id"]

    # Owner invites editor.
    invite = await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": "editor3@example.com", "role": "editor"},
        headers=auth_headers(owner_token),
    )
    assert invite.status_code == 201

    # Editor tries to invite someone else -- should be forbidden.
    forbidden = await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": third_person_email, "role": "viewer"},
        headers=auth_headers(editor_token),
    )
    assert forbidden.status_code == 403


async def test_viewer_cannot_create_document(client):
    owner_token = await register_and_login(client, "owner4@example.com")
    viewer_token = await register_and_login(client, "viewer4@example.com")

    ws = await client.post("/api/workspaces", json={"name": "ViewOnly"}, headers=auth_headers(owner_token))
    workspace_id = ws.json()["id"]

    await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": "viewer4@example.com", "role": "viewer"},
        headers=auth_headers(owner_token),
    )

    resp = await client.post(
        "/api/documents",
        json={"workspace_id": workspace_id, "title": "Doc", "content": "hello"},
        headers=auth_headers(viewer_token),
    )
    assert resp.status_code == 403


async def test_workspace_must_keep_at_least_one_owner(client):
    from tests.conftest import invite, make_workspace

    owner = await register_and_login(client, "lo_owner@example.com")
    workspace_id = await make_workspace(client, owner)
    me = (await client.get("/api/auth/me", headers=auth_headers(owner))).json()

    demote = await client.patch(
        f"/api/workspaces/{workspace_id}/members/{me['id']}", json={"role": "editor"}, headers=auth_headers(owner)
    )
    assert demote.status_code == 400
    remove = await client.delete(f"/api/workspaces/{workspace_id}/members/{me['id']}", headers=auth_headers(owner))
    assert remove.status_code == 400

    # With a second owner, demoting the first is fine.
    await register_and_login(client, "lo_second@example.com")
    await invite(client, owner, workspace_id, "lo_second@example.com", "owner")
    ok = await client.patch(
        f"/api/workspaces/{workspace_id}/members/{me['id']}", json={"role": "editor"}, headers=auth_headers(owner)
    )
    assert ok.status_code == 200


async def test_owner_can_change_roles_and_remove_members(client):
    from tests.conftest import invite, make_workspace

    owner = await register_and_login(client, "rr_owner@example.com")
    member = await register_and_login(client, "rr_member@example.com")
    workspace_id = await make_workspace(client, owner)
    await invite(client, owner, workspace_id, "rr_member@example.com", "viewer")
    member_id = (await client.get("/api/auth/me", headers=auth_headers(member))).json()["id"]

    promoted = await client.patch(
        f"/api/workspaces/{workspace_id}/members/{member_id}", json={"role": "editor"}, headers=auth_headers(owner)
    )
    assert promoted.json()["role"] == "editor"

    # A non-owner can never manage members, even themselves.
    self_promote = await client.patch(
        f"/api/workspaces/{workspace_id}/members/{member_id}", json={"role": "owner"}, headers=auth_headers(member)
    )
    assert self_promote.status_code == 403

    removed = await client.delete(f"/api/workspaces/{workspace_id}/members/{member_id}", headers=auth_headers(owner))
    assert removed.status_code == 204
    gone = await client.get(f"/api/workspaces/{workspace_id}", headers=auth_headers(member))
    assert gone.status_code == 404


async def test_rename_and_delete_workspace_are_owner_only(client):
    from tests.conftest import invite, make_workspace

    owner = await register_and_login(client, "rd_owner@example.com")
    editor = await register_and_login(client, "rd_editor@example.com")
    workspace_id = await make_workspace(client, owner, "Old name")
    await invite(client, owner, workspace_id, "rd_editor@example.com", "editor")

    assert (await client.patch(f"/api/workspaces/{workspace_id}", json={"name": "Hax"}, headers=auth_headers(editor))).status_code == 403
    renamed = await client.patch(f"/api/workspaces/{workspace_id}", json={"name": "New name"}, headers=auth_headers(owner))
    assert renamed.json()["name"] == "New name"

    assert (await client.delete(f"/api/workspaces/{workspace_id}", headers=auth_headers(editor))).status_code == 403
    assert (await client.delete(f"/api/workspaces/{workspace_id}", headers=auth_headers(owner))).status_code == 204
    assert (await client.get(f"/api/workspaces/{workspace_id}", headers=auth_headers(owner))).status_code == 404


async def test_create_workspace_returns_owner_role(client):
    token = await register_and_login(client, "cr_owner@example.com")
    resp = await client.post("/api/workspaces", json={"name": "X"}, headers=auth_headers(token))
    assert resp.json()["my_role"] == "owner"
