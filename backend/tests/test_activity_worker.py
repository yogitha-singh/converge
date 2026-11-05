from types import SimpleNamespace

import pytest

from app.workers.activity_worker import PENDING_KEY, _discard_pending_activity, recorder
from tests.conftest import auth_headers, make_workspace, register_and_login

pytestmark = pytest.mark.asyncio


async def test_events_are_persisted_by_background_worker_after_commit(client):
    await recorder.start()
    try:
        token = await register_and_login(client, "aw_owner@example.com", name="Ada Worker")
        workspace_id = await make_workspace(client, token, "Async WS")
    finally:
        await recorder.stop()  # drains the queue

    feed = await client.get(f"/api/workspaces/{workspace_id}/activity", headers=auth_headers(token))
    created = [e for e in feed.json() if e["action"] == "workspace.created"]
    assert len(created) == 1
    assert created[0]["actor_name"] == "Ada Worker"


async def test_logging_falls_back_to_inline_write_without_worker(client):
    assert not recorder.running
    token = await register_and_login(client, "aw_inline@example.com")
    workspace_id = await make_workspace(client, token)
    feed = await client.get(f"/api/workspaces/{workspace_id}/activity", headers=auth_headers(token))
    assert any(e["action"] == "workspace.created" for e in feed.json())


async def test_rolled_back_transactions_discard_pending_events():
    fake_session = SimpleNamespace(info={PENDING_KEY: [{"action": "never.happened"}]})
    _discard_pending_activity(fake_session)
    assert PENDING_KEY not in fake_session.info
