# Converge — Architecture

```
            ┌──────────────────────────────── Browser ────────────────────────────────┐
            │ React + TS │ REST client (token refresh) │ Document socket (reconnect)   │
            └─────┬───────────────────────┬──────────────────────────┬────────────────┘
                  │ REST /api/*           │ WebSocket /ws/documents/{id}
                  ▼                       ▼
          ┌────────────── nginx (prod) — one origin, TLS in front ──────────────┐
          └───────────────┬─────────────────────────────────────────────────────┘
                          ▼
   ┌──────────────── FastAPI (N instances) ────────────────┐
   │ api/ routes ─► services ─► repositories ─► SQLAlchemy │
   │ websocket/   (rooms, presence, fan-out)               │
   │ workers/     (async audit-log writer)                 │
   └──────────┬─────────────────────────────┬──────────────┘
              ▼                             ▼
        PostgreSQL                        Redis
   users, workspaces, members,       presence (hash per doc),
   documents, versions, comments,    pub/sub channel per doc
   notifications, activity           (nothing durable)
```

## Layers (backend)

| Layer | Responsibility | Rule |
|-------|----------------|------|
| `api/` | HTTP parsing, status codes | thin; no queries, no role checks |
| `services/` | business rules + **all authorization** | every workspace/document path goes through `permission_service` |
| `repositories/` | SQL | no business decisions |
| `models/`, `schemas/` | ORM tables, Pydantic I/O | enums persist lowercase values to match migrations |
| `websocket/` | rooms, presence, broadcast | per-message DB sessions |
| `workers/` | background work | must never block or fail a request |

## What lives where (and why)

* **PostgreSQL** — anything that must survive a restart or be audited. Also the *arbiter* of
  concurrent edits (row lock + revision).
* **Redis** — only ephemeral state: presence and pub/sub. Losing Redis blanks the avatar list
  for a moment; no user data is at risk. REST works without it (events are best-effort).

## Realtime event types (server → clients of a document)

`operation` (authoritative text), `presence`, `cursor`, `meta` (status/type changed),
`comment_event` (created/replied/resolved/reopened). Comment and workflow changes are made over
REST and *pushed* via the same channel, so every open editor updates without polling.

## Security model

* Passwords: bcrypt. Access token 30 min, refresh token 7 days, token *type* checked so a refresh
  token can't be used as an access token. The browser client refreshes transparently and logs
  out cleanly if refresh fails; sockets refresh on close code `4401`.
* **Authorization is server-side and re-derived per request** from `workspace_members`. Non-members
  get `404` (not `403`) so IDs can't be probed. Tests change IDs across workspaces for every
  document sub-resource to prove it.
* WebSocket: token in the query string (browsers can't set headers on WS), validated after
  `accept`, then closed with an application code (`4401` bad token, `4403` no access). Viewers
  may watch but not send operations.
* HTTP hardening: CSP / `nosniff` / frame denial / HSTS (prod) headers, strict CORS allow-lists,
  rate limits on login/register, parameterized SQL only, LIKE wildcards escaped in search,
  message size cap on the socket, API docs disabled in production.
* Never in git: secrets come from the environment (`.env.example` lists them).

## Async audit log

`ActivityService.log()` is O(1): it stashes the event on the DB session. A SQLAlchemy
`after_commit` hook hands it to an in-process queue **only if the business transaction
committed** (rollbacks discard it), and a background task writes it in its own transaction.
Shutdown drains the queue. Trade-off: events still queued during a hard crash are lost; for a
stronger guarantee replace the queue with a transactional outbox table or Redis Streams — the
`ActivityService` interface stays the same. Without the worker (scripts/tests) it writes inline.

## Search

`GET /api/search` and the document list use `ILIKE` over title and content, restricted to
workspaces the caller belongs to, backed by `pg_trgm` GIN indexes (migration 0002). That is
deliberately Postgres-only; move to `tsvector`/ranking before reaching for Elasticsearch.

## Observability

Structured logs (JSON in production) with a per-request `X-Request-ID` echoed in responses and
included in every log line; `/health` checks Postgres and Redis; access log excludes `/health`.

## Scaling notes

Run N backend instances behind nginx/ALB (`docker compose -f docker-compose.prod.yml up --scale backend=3`).
Row locks keep writes correct; Redis keeps WebSockets consistent. The first bottlenecks would be
the single Postgres writer (add read replicas for list/search) and whole-document operations on
very large documents (move to deltas).
