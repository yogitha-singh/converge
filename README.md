# Converge

**A real-time collaborative engineering workspace.** Teams write specs, RFCs, meeting notes and
sprint plans together — with live cursors, a review workflow, threaded comments, time-travel
history, role-based access and a full audit trail.

> Built as a production-oriented system: server-authoritative concurrency, Redis-backed
> presence, PostgreSQL persistence, strict backend authorization, tests at every layer, CI/CD
> and Docker deployment. See [`docs/`](docs) for the engineering write-ups.

![Editor screenshot](docs/screenshots/editor.png)
<sub>Add screenshots to `docs/screenshots/` after running `make seed` (editor, command palette, workspace, activity).</sub>

## Features

| | |
|---|---|
| **Live editing** | WebSocket collaboration, live presence avatars, remote cursors, offline/reconnect handling. Concurrent edits to *different* parts of a document are both kept (three-way rebase); overlapping edits are flagged. |
| **Document lifecycle** | Types (Spec · RFC · Meeting Notes · Sprint Plan) with icons, and a status workflow **Draft → In Review → Approved → Archived**. Approval is owner-only; archived documents are read-only. |
| **Version history** | One entry per editing session, preview any version, **restore** with one click (restore appends — nothing is rewritten). |
| **Threaded comments** | Select text → **Comment**; highlights stay anchored as the text changes; replies, resolve/reopen, `@mentions` with autocomplete; updates arrive live. |
| **RBAC** | Owner / Editor / Commenter / Viewer, enforced on the server for every route and socket. "Manage members" modal: invite by email, change roles, remove, rename/delete workspace. |
| **Command palette** | `Ctrl/⌘ + K` anywhere: search all documents (title + content), switch workspace, create a document, open activity/members, sign out. |
| **Activity log** | Per-workspace timeline of who did what, grouped by day, written asynchronously so it never slows a request. |
| **Notifications** | Bell with unread badge for invites, mentions and replies — each deep-links to the right place. |
| **Production hardening** | JWT access/refresh with transparent renewal, rate limits, security headers, structured logs with request IDs, `/health`, non-root images, migrations tested up/down in CI. |

## Quick start (Docker)

```bash
cp .env.example .env
#   edit .env: set JWT_SECRET_KEY  (openssl rand -hex 32)
docker compose up --build         # Postgres, Redis, API (auto-migrates), Vite dev server
make seed                         # optional: demo users, documents, comments
```

* App: <http://localhost:5173>  ·  API docs: <http://localhost:8000/docs>  ·  Health: <http://localhost:8000/health>
* Demo logins after `make seed` (password `password123`): `alice@example.com` (owner),
  `bish@example.com` (editor), `sarah@example.com` (commenter).
* Try it: open **API Architecture** in two browsers as different users — type in one, watch the
  other update, see cursors and presence. Press **Ctrl/⌘+K**.

### Upgrading from an earlier build

```bash
docker compose up -d postgres
docker compose exec postgres psql -U converge -c "SELECT enum_range(NULL::workspacerole);"
#  expected: {owner,editor,commenter,viewer}
docker compose up --build        # applies migration 0002 (status/type, comment quotes, search indexes)
```
Throwaway dev data? `docker compose down -v` gives a clean database.

## Architecture in one picture

```
React (TS) ── REST /api ──────► FastAPI ──► services ──► repositories ──► PostgreSQL
    │                              │  └─ activity worker (async audit log)
    └── WebSocket /ws ────────────►│
                                   └─ Redis: presence + pub/sub fan-out (multi-instance safe)
```

* **PostgreSQL** is the source of truth *and* the arbiter of concurrent edits (row lock + revision check).
* **Redis** holds only ephemeral state; losing it never loses data.
* Full detail: [`docs/architecture.md`](docs/architecture.md) · [`docs/concurrency.md`](docs/concurrency.md)
  · [`docs/api.md`](docs/api.md) · [`docs/deployment.md`](docs/deployment.md)

## Tech stack

Python 3.12 · FastAPI · async SQLAlchemy 2 · Alembic · Pydantic v2 · PostgreSQL 16 · Redis 7 ·
React 18 · TypeScript · Tailwind · Vite · Vitest · pytest · Docker · nginx · GitHub Actions

## Project layout

```
backend/app/{api,services,repositories,models,schemas,websocket,workers,core}
backend/{alembic,tests}      frontend/src/{api,components,pages,context,hooks,utils}
docs/  scripts/seed_demo.py  docker-compose{,.prod}.yml  .github/workflows/{ci,deploy}.yml  Makefile
```

## Testing

```bash
make test-backend     # pytest against real Postgres + Redis (starts them via compose)
make test-frontend    # vitest: rebase/merge logic, anchors, mentions, workflow rules, components
```

Backend coverage includes: auth & refresh; RBAC boundaries; **cross-workspace ID tampering on every
document sub-resource**; stale-revision conflicts; workflow transitions & owner-only approval;
archived read-only; version session coalescing & restore; comments, mentions, notifications;
search (cross-workspace, wildcard escaping); the async audit worker; and real WebSocket flows
(auth close codes, broadcast, cursors, stale resync, no-op ack, viewer rejection, live comment &
workflow pushes). CI also migrates up → down → up.

## Deployment

`docker compose -f docker-compose.prod.yml up -d --build` runs the production shape (nginx serves
the SPA and proxies `/api` + `/ws` on one origin; Postgres/Redis/API are private). Scale the API
with `--scale backend=N`. See [`docs/deployment.md`](docs/deployment.md) for TLS, AWS mapping,
backups and the pre-launch checklist.

## Design decisions & honest limits

* **Not OT/CRDT.** Concurrency is server-authoritative revisions + client-side three-way rebase.
  Non-overlapping edits merge; overlapping ones keep the local edit and tell the user. For
  intention-preserving merging, adopt Yjs — see `docs/concurrency.md`.
* **Whole-document operations** (debounced, ≤ ~2 MB) rather than deltas — simple and robust for
  specs/RFCs; deltas would be the next step for very large documents.
* **Plain-text editor** (textarea with highlight layer), not rich text.
* **Audit events** are queued in-process after commit; a hard crash can drop the last few. A
  transactional outbox would close that gap.
* **Rate limiting** is per-process (use Redis storage when running several instances).
* Invitations require the invitee to have an account already; no email delivery.

## License

MIT — see [LICENSE](LICENSE).
