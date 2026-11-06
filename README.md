<div align="center">

<img src="docs/screenshots/screenshots/login-page.png" alt="Converge" width="100%" />

# Converge

### A real-time workspace for engineering teams

Converge brings technical documentation and team collaboration into one workspace. Teams can co-edit specifications, RFCs, meeting notes and sprint plans, discuss changes with anchored comments, review document history, and manage access through server-enforced roles.

**The engineering focus:** reliable concurrent editing with PostgreSQL-backed revisions, conflict detection and client-side rebase — rather than treating WebSockets as a substitute for a consistency model.

<br />

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-converge--one--tau.vercel.app-success?style=for-the-badge&logo=vercel&logoColor=white)](https://converge-one-tau.vercel.app)
[![API Docs](https://img.shields.io/badge/API_Docs-Swagger_UI-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)](https://converge-backend-rvnx.onrender.com/docs)

![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy_2-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis_7-DC382D?style=flat-square&logo=redis&logoColor=white)
![WebSockets](https://img.shields.io/badge/WebSockets-010101?style=flat-square&logo=socketdotio&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

<br />

[**Screenshots**](#-screenshots) ·
[**Architecture**](#-system-architecture) ·
[**Concurrency Model**](#-the-concurrency-model) ·
[**Real-Time Lifecycle**](#-real-time-lifecycle) ·
[**Quick Start**](#-quick-start-local) ·
[**Deploy**](#-cloud-deployment) ·
[**Report Bug**](https://github.com/yogitha-singh/converge/issues)

</div>

## Project at a glance

| | Details |
|---|---|
| **Category** | Full-stack application · Real-time collaboration · Engineering productivity |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Backend** | Python 3.12, FastAPI, Pydantic |
| **Data & messaging** | PostgreSQL, SQLAlchemy, Alembic, Redis, WebSockets |
| **Quality & delivery** | pytest, Vitest, Docker Compose, GitHub Actions |
| **Live application** | [converge-one-tau.vercel.app](https://converge-one-tau.vercel.app) |
| **API reference** | [Swagger UI](https://converge-backend-rvnx.onrender.com/docs) |

---

> [!NOTE]
> The first request to the live demo can take 30–60 seconds: the free-tier API on Render spins down when idle. After that it is fast.

## ✨ Why Converge?

Most "collaborative editor" projects are CRUD with a WebSocket bolted on. Converge is built around the hard parts:

| The problem | How Converge solves it |
|---|---|
| Two people edit at once — who wins? | **Server-authoritative revisions** with a **row lock** in PostgreSQL. Stale writes are rejected, never silently applied. |
| A rejected write shouldn't eat what you just typed | A client-side **three-way rebase** merges non-overlapping edits from both people. |
| Any client can lie about its role | **Authorization lives in the service layer**, re-derived from the database on every request and socket message. |
| Presence must not rot in the database | **Redis** holds ephemeral presence + pub/sub fan-out, so the API can run as N instances. |
| Documents have lifecycles | A **status workflow** (Draft → In Review → Approved → Archived) with owner-only approval and read-only archives. |
| "Who changed what?" | An **audit log** written by a background worker that never slows a request. |

---

## 📸 Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/login-page.png" alt="Login page" width="100%" />
      <br /><b>🔐 Authentication</b>
      <br /><sub>JWT access + refresh tokens, transparent renewal</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/home-screen.png" alt="Home screen" width="100%" />
      <br /><b>🏠 Workspace Dashboard</b>
      <br /><sub>Workspaces, documents, status badges and type icons</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/document-editor-live.png" alt="Live document editor" width="100%" />
      <br /><b>✍️ Real-Time Editor</b>
      <br /><sub>Live presence, remote cursors, anchored inline comments</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/command-palette.png" alt="Command palette" width="100%" />
      <br /><b>⌘ Command Palette</b>
      <br /><sub>Ctrl/⌘+K: search all documents, switch workspace, run actions</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/rbac-manage-members.png" alt="Manage members" width="100%" />
      <br /><b>🛡️ Role-Based Access Control</b>
      <br /><sub>Owner, Editor, Commenter, Viewer — enforced server-side</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/new-document-modal.png" alt="New document modal" width="100%" />
      <br /><b>📄 Document Types & Workflow</b>
      <br /><sub>Spec, RFC, Meeting Notes, Sprint Plan</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/screenshots/workspace-activity.png" alt="Workspace activity feed" width="100%" />
      <br /><b>🧾 Activity & Audit Log</b>
      <br /><sub>Timeline of who did what, grouped by day</sub>
    </td>
  </tr>
</table>

---

## 🚀 Features

<table>
<tr>
<td valign="top" width="50%">

**Collaboration**
- Live co-editing over WebSockets
- Presence avatars and remote cursors
- Threaded comments anchored to selected text
- `@mentions` with autocomplete → notifications
- Reconnect and offline handling

**Workflow**
- Types: **Spec · RFC · Meeting Notes · Sprint Plan**
- Status: **Draft → In Review → Approved → Archived**
- Owner-only approval, read-only archives
- Live status changes pushed to open editors

</td>
<td valign="top" width="50%">

**History & Audit**
- Version history: one entry per editing session
- Preview any version, one-click **restore**
- Restore *appends* — nothing is rewritten
- Async per-workspace activity log

**Platform**
- JWT auth with refresh tokens
- Granular RBAC (4 roles)
- ⌘K command palette
- Notifications with deep links
- Structured logs, request IDs, `/health`

</td>
</tr>
</table>

---

## 🏗️ System Architecture

```mermaid
flowchart LR
    subgraph Browser["🖥️ Browser"]
        UI["React 18 + TypeScript<br/>Vite · Tailwind"]
    end

    CDN["Vercel CDN<br/>static SPA"]

    subgraph Backend["⚙️ FastAPI service — N instances"]
        REST["REST routers<br/>/api/*"]
        WS["WebSocket endpoint<br/>/ws/documents/:id"]
        SVC["Service layer<br/>authorization · workflow · concurrency"]
        WORKER["Async audit-log worker"]
    end

    PG[("PostgreSQL 16<br/>source of truth")]
    RD[("Redis 7<br/>presence · pub/sub")]

    UI -->|static assets| CDN
    UI -->|REST + JWT| REST
    UI <-->|WebSocket + JWT| WS
    REST --> SVC
    WS --> SVC
    SVC --> PG
    SVC -.->|events after commit| WORKER
    WORKER --> PG
    WS <-->|presence + subscribe| RD
    SVC -->|publish comment / status events| RD
```

**Design principles**

- **PostgreSQL is the source of truth *and* the referee.** The row lock + revision check live in the database, so correctness never depends on which API instance handled a request.
- **Redis holds only ephemeral state.** Presence and pub/sub. If Redis restarts, avatars blink — no data is lost.
- **Layered backend.** `api/` (thin) → `services/` (rules + authorization) → `repositories/` (SQL only) → `models/`.
- **Side effects never fail a request.** Audit logging and realtime pushes are best-effort by design.

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Router | Type-safe, responsive UI; custom editor surface with a highlight layer |
| **Backend** | Python 3.12, FastAPI, Pydantic v2 | Async REST + WebSocket API with generated OpenAPI docs |
| **Database** | PostgreSQL 16, SQLAlchemy 2 (async), Alembic | Relational integrity, row-level locking, `pg_trgm` search indexes, migrations |
| **Realtime / Cache** | Redis 7 | Presence state and cross-instance pub/sub fan-out |
| **Auth** | JWT (python-jose), bcrypt | Access + refresh tokens, typed so one can't stand in for the other |
| **Testing** | pytest, Vitest, Testing Library | Backend integration tests on real Postgres + Redis; frontend logic and components |
| **DevOps** | Docker, Docker Compose, nginx, GitHub Actions | Reproducible dev, production images, CI |
| **Hosting** | Vercel · Render · Neon · Upstash | Static frontend · containerized API · serverless Postgres · serverless Redis |

---

## 🧠 The Concurrency Model

> **The challenge:** two users edit the same document at nearly the same moment. Neither edit may be silently lost, and every client must converge on the same text.

Converge uses **optimistic concurrency control** on a **server-authoritative revision counter**. This is deliberately *not* a full OT/CRDT engine — it's a simpler model whose guarantees and limits are explicit.

### How a write is validated and broadcast

```mermaid
sequenceDiagram
    autonumber
    participant A as Client A
    participant B as Client B
    participant WS as FastAPI WebSocket
    participant PG as PostgreSQL
    participant R as Redis Pub/Sub

    A->>WS: operation (base_revision 7, content, client_id)
    WS->>WS: authenticate and authorize (Editor or Owner)
    WS->>PG: BEGIN, SELECT ... FOR UPDATE (row lock)
    alt document is archived
        WS-->>A: error DOCUMENT_ARCHIVED
    else current revision differs from base_revision (stale)
        WS-->>A: stale_revision (current_revision, current_content)
        Note over A: rebase unsent edits onto the<br/>server state (3-way merge), then retry
    else content unchanged (no-op)
        WS-->>A: ack (revision)
    else current revision equals base_revision (happy path)
        WS->>PG: revision = 8, write version, COMMIT
        WS->>R: PUBLISH channel:doc:id (revision 8, origin = A)
        R-->>A: operation (origin is A, adopt revision only)
        R-->>B: operation (merge into B's view)
    end
```

### Optimistic concurrency, step by step

1. Every document has an integer `revision`. Every write carries the **`base_revision`** the client last saw.
2. The server takes a **row lock** (`SELECT … FOR UPDATE`) on the document. Concurrent writers to the same document queue up *inside PostgreSQL*.
3. It compares `document.revision` with `base_revision`:
   - **Equal** → apply, `revision += 1`, record history, commit, then broadcast.
   - **Different** → reject with `stale_revision` plus the current content. **Nothing is overwritten.**
4. The row is loaded with `populate_existing`, so an ORM-cached copy can never make a stale check pass.
5. Revision, content and history are written in **one transaction**.

Because Redis delivers messages on a channel in order, every client observes operations in the order the database committed them.

### Not losing the loser's typing — three-way rebase

Rejecting a stale write is only half the story; a naive client would then throw away what the user just typed. The editor tracks three texts:

| Text | Meaning |
|---|---|
| `base` | Last server-confirmed text (and revision) |
| `local` | What's in the textarea — base plus unsent typing |
| `remote` | The server's newer text — base plus someone else's edit |

| Situation | Result |
|---|---|
| Edits touch **different regions** (A edits paragraph 1, B edits paragraph 3) | ✅ **Both are kept**; the caret is remapped so it doesn't jump |
| Edits **overlap** | Local edit wins and is re-sent on the new revision; user sees a toast; the other version stays in history |
| Own operation echoes back | Only the revision is adopted — the textarea is never overwritten with an older echo |
| Server says stale but client already caught up | Client simply re-sends |

Only **one operation is in flight** at a time; typing during a round trip is queued and sent when it resolves.

<details>
<summary><b>⚖️ Honest limits of this model (click to expand)</b></summary>

<br />

- Not intention-preserving: overlapping edits are last-writer-wins within the overlap. For true character-level merging, the upgrade path is a CRDT (e.g. Yjs).
- Each side is reduced to **one contiguous changed region**. Two far-apart edits inside a single debounce window *plus* a collaborator editing between them is treated as an overlap.
- Operations carry the **debounced full text** (bounded to ~2 MB per message), not deltas. That is simple and robust for specs and RFCs; delta operations would be the next step for very large documents.
- Edits made while offline are held locally and rebased on reconnect.

</details>

---

## 🔄 Real-Time Lifecycle

### Connection state machine

```mermaid
stateDiagram-v2
    [*] --> Connecting
    Connecting --> Open: handshake ok
    Open --> Reconnecting: network drop or server restart
    Reconnecting --> Open: retry with exponential backoff
    Connecting --> Reconnecting: close 4401, refresh JWT, retry now
    Connecting --> Denied: close 4403, no access
    Denied --> [*]
```

### Heartbeat & presence (Redis)

| Step | What happens |
|---|---|
| **Join** | Server accepts the socket, validates the JWT and workspace membership, **subscribes to the document's Redis channel first**, then announces the joiner (so the first presence broadcast can't be missed). |
| **Heartbeat** | Client sends `heartbeat` every **15 s**; the server refreshes that connection's `last_seen` in a Redis hash (`presence:doc:{id}`) and re-broadcasts presence. |
| **Expiry** | An entry that misses **3 heartbeats (45 s)** is dropped on the next read, and the hash itself expires after inactivity. Presence is **never** stored in PostgreSQL. |
| **Multi-tab** | Presence is keyed **per connection**, then de-duplicated by user — closing one tab doesn't mark you offline while another is open. |
| **Leave** | A clean disconnect removes the connection's entry immediately and broadcasts the new presence list. |
| **Cursors** | Cursor positions are throttled (~150 ms) client-side and relayed through the same channel. |

### Reconnect logic

- **Exponential backoff:** 0.5 s → 1 → 2 → 4 → 8 → **15 s cap**.
- **Expired JWT (close code `4401`):** the client refreshes its access token and reconnects immediately — no manual re-login.
- **No access (close code `4403`):** the client stops retrying and shows a banner.
- **Resync on reconnect:** the client re-fetches the document, **rebases any unsent edits** on top of it, and flushes. While offline the editor shows *"Offline — will sync"*.
- **Leaving with unsent edits:** a `beforeunload` warning plus a best-effort revision-checked REST save.

<details>
<summary><b>📡 WebSocket protocol reference</b></summary>

<br />

`WS /ws/documents/{document_id}?token=<access token>`

**Client → server**

```json
{ "type": "operation", "base_revision": 7, "content": "…", "title": "…", "client_id": "<per-tab id>" }
{ "type": "cursor", "position": 120, "selection_start": 110, "selection_end": 120 }
{ "type": "heartbeat" }
```

**Server → client**

```json
{ "type": "presence", "users": [{ "user_id": "…", "name": "…", "last_seen": 1730000000.0 }] }
{ "type": "operation", "revision": 8, "content": "…", "title": "…", "edited_by_name": "…", "origin": "<client_id | rest | restore>" }
{ "type": "ack", "revision": 7 }
{ "type": "stale_revision", "current_revision": 8, "current_content": "…", "current_title": "…" }
{ "type": "meta", "status": "in_review", "doc_type": "rfc", "changed_by_name": "…" }
{ "type": "comment_event", "event": "created | replied | resolved | reopened", "comment_id": "…" }
{ "type": "cursor", "user_id": "…", "name": "…", "position": 120 }
{ "type": "error", "code": 403, "message": "…" }
```

Close codes: `4401` bad/expired token (refresh and reconnect) · `4403` no access (don't retry).

</details>

---

## 📋 Document Lifecycle

```mermaid
stateDiagram-v2
    state "In Review" as InReview
    [*] --> Draft
    Draft --> InReview: request review
    InReview --> Draft: changes requested
    InReview --> Approved: owner approves
    Approved --> InReview: owner reopens
    Draft --> Archived
    InReview --> Archived
    Approved --> Archived
    Archived --> Draft: revive
```

- Invalid jumps (e.g. `Draft → Approved`) are rejected by the API with `409`.
- Entering or leaving **Approved** is **owner-only** — a lightweight separation of duties.
- **Archived** documents are read-only for content, restores and type changes.
- Every transition is audit-logged and pushed live to everyone viewing the document.

---

## 🛡️ Role-Based Access Control

Roles are per workspace and **re-derived from the database on every request and socket message.** The frontend only hides buttons; it never decides anything.

| Capability | 👑 Owner | ✏️ Editor | 💬 Commenter | 👁️ Viewer |
|---|:---:|:---:|:---:|:---:|
| View documents, history, comments | ✅ | ✅ | ✅ | ✅ |
| Comment and reply | ✅ | ✅ | ✅ | ❌ |
| Resolve comments | any | any | own only | ❌ |
| Create and edit documents (live) | ✅ | ✅ | ❌ | ❌ |
| Restore a previous version | ✅ | ✅ | ❌ | ❌ |
| Move Draft ↔ In Review ↔ Archived | ✅ | ✅ | ❌ | ❌ |
| **Approve** / change an approved doc | ✅ | ❌ | ❌ | ❌ |
| Delete documents | ✅ | ❌ | ❌ | ❌ |
| Invite, change roles, remove members | ✅ | ❌ | ❌ | ❌ |
| Rename or delete the workspace | ✅ | ❌ | ❌ | ❌ |

Security notes:

- Non-members receive **`404`, not `403`**, so resource IDs can't be probed.
- Tests tamper with IDs across workspaces for **every document sub-resource** (versions, comments, meta, delete…).
- A workspace must always keep **at least one owner**.
- A `Viewer` who opens a socket can watch, but any `operation` they send is rejected.

---

## 🗄️ Database Schema

```mermaid
erDiagram
    USERS ||--o{ WORKSPACE_MEMBERS : "has membership"
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : "has members"
    WORKSPACES ||--o{ DOCUMENTS : contains
    WORKSPACES ||--o{ ACTIVITY_LOGS : records
    USERS ||--o{ DOCUMENTS : creates
    DOCUMENTS ||--o{ DOCUMENT_VERSIONS : "snapshots"
    DOCUMENTS ||--o{ COMMENTS : "discussed in"
    COMMENTS ||--o{ COMMENT_REPLIES : "has replies"
    USERS ||--o{ COMMENTS : writes
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ ACTIVITY_LOGS : performs

    USERS {
        uuid id PK
        string email UK
        string name
        string hashed_password
        datetime created_at
    }
    WORKSPACES {
        uuid id PK
        string name
        uuid created_by FK
        datetime created_at
    }
    WORKSPACE_MEMBERS {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        enum role "owner, editor, commenter, viewer"
    }
    DOCUMENTS {
        uuid id PK
        uuid workspace_id FK
        string title
        text content
        enum status "draft, in_review, approved, archived"
        enum doc_type "spec, rfc, meeting_notes, sprint_plan"
        int revision "server-authoritative counter"
        uuid created_by FK
        uuid last_edited_by FK
        datetime updated_at
    }
    DOCUMENT_VERSIONS {
        uuid id PK
        uuid document_id FK
        int revision
        string title
        text content
        uuid edited_by FK
        datetime created_at
    }
    COMMENTS {
        uuid id PK
        uuid document_id FK
        uuid author_id FK
        text content
        int range_start
        int range_end
        text quote "re-anchors after edits"
        bool resolved
    }
    COMMENT_REPLIES {
        uuid id PK
        uuid comment_id FK
        uuid author_id FK
        text content
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        enum type "invite, mention, reply"
        string message
        uuid reference_id "workspace or document"
        bool read
    }
    ACTIVITY_LOGS {
        uuid id PK
        uuid workspace_id FK
        uuid actor_id FK
        string action
        string description
        uuid document_id
    }
```

<details>
<summary><b>🧱 Indexes, constraints & history semantics</b></summary>

<br />

- `workspace_members` has a **unique** `(workspace_id, user_id)` constraint; indexed on both columns.
- `documents`: indexed on `workspace_id`, `status`, `updated_at`; **`pg_trgm` GIN indexes** on `title` and `content` make `ILIKE '%term%'` search index-assisted.
- **Version history** keeps a seed version (revision 0) and **one entry per editing session** (same editor within 60 s is folded into one entry). A different editor, a time gap, or a restore starts a new entry. `revision` still counts every accepted operation, so history numbers have gaps — that's expected.
- **Restore appends:** restoring version *k* creates a *new* revision with *k*'s content. Nothing is rewound or deleted.
- Migrations are managed by **Alembic** and are exercised **up → down → up** in CI.

</details>

---

## 🔌 API Overview

Interactive docs: **[Swagger UI](https://converge-backend-rvnx.onrender.com/docs)**.

<details>
<summary><b>📚 REST endpoint reference</b></summary>

<br />

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/refresh` · `GET /api/auth/me` |
| **Workspaces** | `GET/POST /api/workspaces` · `GET/PATCH/DELETE /api/workspaces/{id}` |
| **Members** | `GET/POST /api/workspaces/{id}/members` · `PATCH/DELETE …/members/{user_id}` |
| **Activity** | `GET /api/workspaces/{id}/activity` |
| **Documents** | `GET/POST /api/documents` · `GET/PATCH/DELETE /api/documents/{id}` · `PATCH …/{id}/meta` (status / type) |
| **History** | `GET …/{id}/versions` · `GET …/{id}/versions/{version_id}` · `POST …/{id}/restore` |
| **Comments** | `GET/POST /api/documents/{id}/comments` · `POST /api/comments/{id}/resolve` · `…/reopen` · `…/replies` |
| **Search** | `GET /api/search?q=` (title + content, across your workspaces) |
| **Notifications** | `GET /api/notifications` · `POST …/{id}/read` · `POST …/read-all` |
| **Health** | `GET /health` (checks PostgreSQL and Redis) |
| **Realtime** | `WS /ws/documents/{id}?token=…` |

Errors are always `{"detail": …}`. Conflicts return `409` with a machine-readable body, e.g. `{"detail": {"error": "STALE_REVISION", "current_revision": 8}}`.

</details>

---

## 💻 Quick Start (Local)

The development stack runs the frontend, API, PostgreSQL and Redis through Docker Compose. With this route, you do not need to install Python or Node.js on your host machine.

**Prerequisites**
- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with the Docker engine running

#### 1. Clone the repository

```bash
git clone https://github.com/yogitha-singh/converge.git
cd converge
```

#### 2. Create your environment file

Copy `.env.example` to `.env` in the repository root. On macOS/Linux/Git Bash:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and set the required values, especially `JWT_SECRET_KEY`. Generate a strong key with:

```bash
openssl rand -hex 32
```

Do not commit `.env` or paste production secrets into issue reports.

#### 3. Build and start the services

```bash
docker compose up --build
```

Keep this terminal open while developing. The API applies database migrations during startup.

#### 4. (Optional) Seed demo data

After the services are healthy, load sample users, documents and comments:

```bash
make seed
```

If `make` is unavailable, run the seed script using the project's documented Python environment:

```bash
python3 scripts/seed_demo.py
```

| Service | URL |
|---|---|
| 🖥️ Frontend | http://localhost:5173 |
| ⚙️ API + Swagger | http://localhost:8000/docs |
| ❤️ Health check | http://localhost:8000/health |

**Demo accounts** (after seeding, password `password123`): `alice@example.com` (owner) · `bish@example.com` (editor) · `sarah@example.com` (commenter)

> 💡 **See it live:** open *API Architecture* in two different browsers as two different users. Type in one, watch the other update, and see presence and cursors. Then press **Ctrl/⌘ + K**.

<details>
<summary><b>⚙️ Environment variables</b></summary>

<br />

| Variable | Default | Description |
|---|---|---|
| `ENV` | `development` | `production` enables HSTS + JSON logs and **disables `/docs`** |
| `JWT_SECRET_KEY` | — **(required)** | Signing key. Generate with `openssl rand -hex 32` |
| `DATABASE_URL` | — **(required)** | `postgresql+asyncpg://user:pass@host:5432/db` |
| `REDIS_URL` | `redis://localhost:6379/0` | Use `rediss://` for TLS providers |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed browser origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `RATE_LIMIT_LOGIN` | `5/minute` | Per-IP login limit |
| `RATE_LIMIT_REGISTER` | `10/minute` | Per-IP registration limit |
| `VERSION_COALESCE_SECONDS` | `60` | Edits by one user within this window share one history entry |
| `LOG_JSON` | `false` | One JSON object per log line (always on in production) |
| `WEB_CONCURRENCY` | `2` | Uvicorn workers per container |
| `VITE_API_URL` | `http://localhost:8000` | Frontend → API base URL (build-time) |
| `VITE_WS_URL` | `ws://localhost:8000` | Frontend → WebSocket base URL (build-time) |

</details>

---

## 🧰 Troubleshooting

Use this section to narrow down setup and deployment issues before changing application code.

| Symptom | Likely cause | What to check |
|---|---|---|
| `docker compose` cannot connect to the daemon | Docker Desktop is closed or still starting | Start Docker Desktop, wait until the engine is running, then retry. |
| A service fails with `port is already allocated` | Another process is using a required port | Stop the conflicting process or update the host-port mapping in `docker-compose.yml`. |
| API exits because a setting is missing | `.env` was not created, is in the wrong directory, or lacks a required value | Confirm `.env` is in the repository root and contains the variables listed below. |
| Database connection is refused | PostgreSQL container is not healthy, or the API started before it was ready | Run `docker compose ps` and `docker compose logs db` (use the actual database service name from Compose). Then inspect API logs. |
| `password authentication failed` | Database credentials in `.env` do not match the initialized database volume | Check the Compose database credentials. If this is a disposable local database, stop the stack and remove its volume only if you are comfortable deleting its data. |
| Frontend loads but API requests fail | Incorrect `VITE_API_URL`, CORS origin, or API service state | Verify the frontend API URL, backend `CORS_ORIGINS`, and that `/health` responds. Vite variables are baked in at build time, so rebuild after changing them. |
| WebSocket connection fails | Wrong WebSocket URL, token, or origin | Use `ws://` locally and `wss://` in production; verify the token and allowed origin. Check browser DevTools → Network → WS. |
| Live demo is initially slow | Render free-tier service may be waking from idle | Wait for the first request to complete, then retry. |
| Production database connection fails with SSL errors | Provider URL is not in asyncpg-compatible form | For Neon, follow the URL conversion guidance in the deployment section and use `ssl=require`. |

### Useful diagnostic commands

```bash
# See running services and health status
docker compose ps

# Follow logs for all services
docker compose logs -f

# Follow one service (replace <service> with its Compose service name)
docker compose logs -f <service>

# Rebuild after dependency or frontend build-time configuration changes
docker compose up --build
```

> **Before deleting volumes:** `docker compose down -v` removes named volumes and can permanently delete local database data. Use it only when you intentionally want a clean database.

---

## ☁️ Cloud Deployment

| Tier | Provider | Why |
|---|---|---|
| Frontend | **Vercel** | Static Vite build on a global CDN |
| API | **Render** | Runs the backend Docker image; WebSockets supported |
| Database | **Neon** | Serverless PostgreSQL 16 |
| Cache / Pub-Sub | **Upstash** | Serverless Redis |

### 1 · Database — Neon
1. Create a project and copy the connection string.
2. Convert it for SQLAlchemy's async driver:
   - change the scheme to `postgresql+asyncpg://`
   - replace `?sslmode=require` with **`?ssl=require`** (asyncpg doesn't understand `sslmode`)
   - remove `channel_binding=…` if present

```text
postgresql+asyncpg://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?ssl=require
```

### 2 · Redis — Upstash
Create a database and copy the **TLS** URL (`rediss://default:PASSWORD@HOST:6379`). Presence, heartbeats and pub/sub all count against the free-tier command quota.

### 3 · API — Render
1. **New → Web Service** → connect the repo.
2. **Runtime:** Docker · **Root Directory:** `backend` (uses `backend/Dockerfile`).
3. **Health Check Path:** `/health`
4. Set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon URL from step 1 |
| `REDIS_URL` | the Upstash `rediss://` URL |
| `JWT_SECRET_KEY` | a long random string |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://converge-one-tau.vercel.app` (no trailing slash) |
| `WEB_CONCURRENCY` | `1` on the free 512 MB instance |
| `ENV` | `production` for a hardened deploy. *(API docs are disabled in `production`; use `staging` to keep Swagger public, as in the live demo.)* |

The container runs `alembic upgrade head` before starting the server, so migrations apply on every deploy.

### 4 · Frontend — Vercel
1. **Add New Project** → import the repo → **Root Directory:** `frontend` → Framework preset: **Vite**.
2. Set environment variables (they are baked in at build time):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://converge-backend-rvnx.onrender.com` |
| `VITE_WS_URL` | `wss://converge-backend-rvnx.onrender.com` ← note **`wss://`** |

3. Add `frontend/vercel.json` so deep links like `/documents/…` don't 404 on refresh:

<details>
<summary><b>📄 frontend/vercel.json</b></summary>

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

</details>

<details>
<summary><b>🐳 Self-hosting with Docker Compose (single VM)</b></summary>

<br />

```bash
cp .env.example .env     # set ENV=production, JWT_SECRET_KEY, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

nginx serves the SPA and proxies `/api` and `/ws` on **one origin** (no CORS); Postgres, Redis and the API stay on a private network. Scale the API with `--scale backend=N` — Redis keeps WebSockets consistent across instances. See [`docs/deployment.md`](docs/deployment.md) for TLS, backups and the pre-launch checklist.

</details>

---

## 🧪 Testing

```bash
make test-backend     # pytest against real PostgreSQL + Redis (started via Docker)
make test-frontend    # Vitest: rebase/merge logic, comment anchors, mentions, workflow rules, components
# or, with the stack running:
docker compose exec backend pytest
```

**What the backend suite proves**

- Authentication and the refresh-token flow
- RBAC boundaries, including **cross-workspace ID tampering on every document sub-resource**
- Stale-revision rejection and no-op detection
- Workflow transitions, owner-only approval, archived read-only
- Version-session coalescing and restore
- Comments, mentions, notifications
- Search across workspaces, with LIKE-wildcard escaping
- The asynchronous audit-log worker
- Real WebSocket flows: auth close codes, broadcast to collaborators, cursors, stale resync, viewer rejection, live comment and status pushes

CI (GitHub Actions) runs lint, a **migration up → down → up** check, backend tests, frontend tests + type-check + build, and Docker image builds.

---

## 🧭 Engineering Decisions & Trade-offs

<details>
<summary><b>Why not a CRDT / OT?</b></summary>

<br />

A CRDT (Yjs) gives intention-preserving merges and offline-first editing, but it moves the source of truth away from the database and makes server-side authorization, auditing, and "restore a version" much harder. Converge instead keeps **PostgreSQL authoritative**, uses a revision counter plus a client-side three-way rebase, and documents exactly where that falls short. It is the upgrade path in the roadmap.

</details>

<details>
<summary><b>Why a background worker for the audit log?</b></summary>

<br />

Audit entries matter, but they must never slow down or fail the request that caused them. `ActivityService.log()` stashes the event on the DB session; a SQLAlchemy `after_commit` hook hands it to an in-process queue **only if the business transaction committed** (rollbacks discard it), and a background task writes it. Shutdown drains the queue. Trade-off: events queued during a hard crash can be lost; a transactional outbox would close that gap without changing the interface.

</details>

<details>
<summary><b>Why a per-message database session on the WebSocket?</b></summary>

<br />

A socket can live for hours. Sharing one session across its lifetime pins a transaction and an identity map, and can serve stale rows to the revision check. Every message gets its own short-lived session instead.

</details>

<details>
<summary><b>Why does the server close with custom codes <i>after</i> accepting?</b></summary>

<br />

Closing before the handshake completes surfaces in browsers as an opaque failure (`1006`). Accepting first and then closing with `4401` / `4403` lets the client tell *"refresh your token"* from *"you don't have access"* from *"network down"*.

</details>

---

## 🗺️ Roadmap

- [ ] Yjs-based CRDT for intention-preserving merges and offline-first editing
- [ ] Delta operations instead of whole-document payloads
- [ ] Rich-text editing
- [ ] OAuth sign-in (Google / GitHub)
- [ ] Email delivery for invitations and notifications
- [ ] Redis-backed global rate limiting for multi-instance deploys
- [ ] Transactional outbox for the audit log
- [ ] Kanban view over document statuses

---

## 📁 Project Structure

<details>
<summary><b>Show repository layout</b></summary>

```text
converge/
├── backend/
│   ├── app/
│   │   ├── api/            # thin REST routers
│   │   ├── services/       # business rules + ALL authorization
│   │   ├── repositories/   # SQL only
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic request/response models
│   │   ├── websocket/      # rooms, presence, broadcast
│   │   ├── workers/        # async audit-log writer
│   │   └── core/           # config, security, DB, Redis, logging
│   ├── alembic/            # migrations
│   └── tests/              # pytest suite
├── frontend/
│   └── src/
│       ├── api/            # typed API client + token refresh
│       ├── components/     # UI, editor, command palette, modals
│       ├── pages/          # Login, Workspace, Document editor
│       ├── context/        # auth, workspaces, toasts, palette
│       ├── hooks/          # WebSocket hook (reconnect, heartbeat)
│       └── utils/          # merge/rebase, anchors, mentions
├── docs/                   # architecture, concurrency, API, deployment
├── scripts/seed_demo.py    # demo data via the public API
├── docker-compose.yml      # development
├── docker-compose.prod.yml # production-shaped stack
└── .github/workflows/      # CI + image publishing
```

</details>

---

---

## 🔐 Security & configuration notes

- Never commit `.env`, database credentials, JWT signing keys or provider tokens.
- Use a unique, high-entropy `JWT_SECRET_KEY` outside local development.
- Set `CORS_ORIGINS` to the exact frontend origin(s) you control; avoid permissive wildcards in production.
- Use TLS-enabled service URLs for hosted PostgreSQL/Redis providers.
- The frontend may hide controls based on role, but authorization is enforced by the backend service layer.

## 🤝 Contributing

Contributions, bug reports and focused improvement proposals are welcome.

1. Open an issue describing the bug or proposed change.
2. For a code change, create a focused branch and keep the pull request scoped.
3. Add or update tests for behavior changes.
4. Run the relevant backend/frontend checks before submitting.

For security-sensitive reports, do not publish credentials, tokens or exploitable details in a public issue.

---

## 📚 Further Reading

- [`docs/concurrency.md`](docs/concurrency.md) — the full concurrency, rebase and history write-up
- [`docs/architecture.md`](docs/architecture.md) — layers, security model, scaling notes
- [`docs/api.md`](docs/api.md) — complete API and WebSocket reference
- [`docs/deployment.md`](docs/deployment.md) — deployment guide and pre-launch checklist

---

<div align="center">

**Built by [Yogitha Singh](https://github.com/yogitha-singh)**

*If this project helped or interested you, a ⭐ is much appreciated.*

[Live Demo](https://converge-one-tau.vercel.app) · [API Docs](https://converge-backend-rvnx.onrender.com/docs) · [Issues](https://github.com/yogitha-singh/converge/issues)

</div>
