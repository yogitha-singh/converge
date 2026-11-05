import pytest

pytestmark = pytest.mark.asyncio


async def test_register_creates_user(client):
    resp = await client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "password123"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "alice@example.com"
    assert "hashed_password" not in body


async def test_register_duplicate_email_rejected(client):
    payload = {"email": "bob@example.com", "name": "Bob", "password": "password123"}
    r1 = await client.post("/api/auth/register", json=payload)
    r2 = await client.post("/api/auth/register", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 409


async def test_login_success_and_failure(client):
    await client.post(
        "/api/auth/register",
        json={"email": "carol@example.com", "name": "Carol", "password": "password123"},
    )
    good = await client.post("/api/auth/login", json={"email": "carol@example.com", "password": "password123"})
    assert good.status_code == 200
    assert "access_token" in good.json()

    bad = await client.post("/api/auth/login", json={"email": "carol@example.com", "password": "wrongpass"})
    assert bad.status_code == 401


async def test_me_requires_valid_token(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401

    await client.post(
        "/api/auth/register",
        json={"email": "dave@example.com", "name": "Dave", "password": "password123"},
    )
    login = await client.post("/api/auth/login", json={"email": "dave@example.com", "password": "password123"})
    token = login.json()["access_token"]
    ok = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200
    assert ok.json()["email"] == "dave@example.com"


async def test_refresh_token_flow(client):
    await client.post(
        "/api/auth/register",
        json={"email": "erin@example.com", "name": "Erin", "password": "password123"},
    )
    login = await client.post("/api/auth/login", json={"email": "erin@example.com", "password": "password123"})
    refresh_token = login.json()["refresh_token"]

    refreshed = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    assert "access_token" in refreshed.json()

    bad = await client.post("/api/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert bad.status_code == 401
