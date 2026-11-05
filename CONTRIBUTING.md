# Contributing to Converge

## Setup

Easiest: `cp .env.example .env && make up` (Docker). Without Docker:

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head && uvicorn app.main:app --reload

# frontend
cd frontend && npm install && npm run dev
```

## Where code goes

* **Routes** (`app/api`) parse input and call a service. No queries, no role checks.
* **Services** (`app/services`) hold business rules and **all authorization**. Every
  workspace/document-scoped path must go through `permission_service` — never trust a role the
  client sends. Return `404` (not `403`) to non-members.
* **Repositories** (`app/repositories`) are SQL only.
* **Anything that races** (edits, status changes, restores) must lock the row with
  `get_for_update` — it uses `populate_existing`, so a cached copy can't defeat the check.
* **Background/side effects** (audit log, realtime pushes) must never fail the request.
  `ActivityService.log` and `publish_document_event` already behave this way.
* Enums persist their lowercase *values*; keep model enums and migrations in sync.

## Database changes

```bash
cd backend && alembic revision --autogenerate -m "describe change"
```
Review the migration by hand (autogenerate misses enums/indexes/extensions). CI runs
`upgrade → downgrade base → upgrade`, so write a working `downgrade()`.

## Tests

```bash
make test-backend      # real Postgres + Redis
make test-frontend
make lint
```
Add or update tests with every behavior change — especially permissions and anything touching
revisions. Frontend logic that is pure (merge, anchors, mentions) should stay pure and tested.

## Pull requests

CI runs lint, migration round-trip, backend tests, frontend tests/type-check/build and Docker
builds. Please make sure they pass locally first.
