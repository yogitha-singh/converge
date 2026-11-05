import asyncio
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ["ENV"] = "test"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
# Tests target a real Postgres (models use native UUID/ENUM types) and a real Redis.
# CI and docker-compose both provide them; override via env vars locally if needed.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://converge:converge@localhost:5432/converge_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from app.core.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.websocket.connection_manager import manager  # noqa: E402

TEST_DATABASE_URL = os.environ["DATABASE_URL"]


@pytest.fixture(autouse=True)
def reset_realtime_state():
    """The WebSocket manager is a process-wide singleton; give every test a clean one."""
    manager._rooms.clear()
    manager._listeners.clear()
    manager._lock = asyncio.Lock()
    yield


@pytest_asyncio.fixture(scope="function")
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ----------------------------------------------------------------------------- helpers

async def register_and_login(client: AsyncClient, email: str, name: str | None = None, password: str = "password123"):
    name = name or email.split("@")[0].replace(".", " ").title()
    await client.post("/api/auth/register", json={"email": email, "name": name, "password": password})
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def make_workspace(client: AsyncClient, token: str, name: str = "WS") -> str:
    resp = await client.post("/api/workspaces", json={"name": name}, headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def invite(client: AsyncClient, owner_token: str, workspace_id: str, email: str, role: str) -> None:
    resp = await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": email, "role": role},
        headers=auth_headers(owner_token),
    )
    assert resp.status_code == 201, resp.text


async def make_document(
    client: AsyncClient, token: str, workspace_id: str, title: str = "Doc", content: str = "v0", doc_type: str = "spec"
) -> dict:
    resp = await client.post(
        "/api/documents",
        json={"workspace_id": workspace_id, "title": title, "content": content, "doc_type": doc_type},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
