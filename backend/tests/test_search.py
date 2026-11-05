import pytest

from tests.conftest import auth_headers, make_document, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


async def test_search_spans_workspaces_but_only_ones_you_belong_to(client):
    alice = await register_and_login(client, "s_alice@example.com")
    bob = await register_and_login(client, "s_bob@example.com")

    alice_ws1 = await make_workspace(client, alice, "Engineering")
    alice_ws2 = await make_workspace(client, alice, "Research")
    bob_ws = await make_workspace(client, bob, "Bob private")

    await make_document(client, alice, alice_ws1, title="API Architecture", content="rest and websockets")
    await make_document(client, alice, alice_ws2, title="Experiments", content="architecture of the model")
    await make_document(client, bob, bob_ws, title="Secret architecture", content="architecture")

    results = (await client.get("/api/search?q=architecture", headers=auth_headers(alice))).json()
    assert {r["title"] for r in results} == {"API Architecture", "Experiments"}
    assert {r["workspace_name"] for r in results} == {"Engineering", "Research"}
    content_hit = next(r for r in results if r["title"] == "Experiments")
    assert "architecture" in content_hit["snippet"].lower()


async def test_search_treats_wildcards_literally(client):
    token = await register_and_login(client, "s_wild@example.com")
    ws = await make_workspace(client, token)
    await make_document(client, token, ws, title="Budget 100% done", content="x")
    await make_document(client, token, ws, title="Budget 100 done", content="x")

    results = (await client.get("/api/search", params={"q": "100%"}, headers=auth_headers(token))).json()
    assert [r["title"] for r in results] == ["Budget 100% done"]

    only_underscore = (await client.get("/api/search", params={"q": "_"}, headers=auth_headers(token))).json()
    assert only_underscore == []


async def test_search_requires_auth_and_a_query(client):
    assert (await client.get("/api/search?q=x")).status_code == 401
    token = await register_and_login(client, "s_empty@example.com")
    assert (await client.get("/api/search?q=", headers=auth_headers(token))).status_code == 422
