# Converge — Concurrency, Conflicts & History

Two people type in the same document at the same moment. Neither edit may be lost, every
client must converge on the same text, and history must stay trustworthy. This is how Converge
does that **without** a full OT/CRDT engine (an explicit non-goal), and exactly where the
limits are.

## 1. Server: one authoritative revision, serialized by the database

Every document has an integer `revision`. A write names the revision it was based on.

```
client ── {type:"operation", base_revision:N, content, title, client_id} ──► WebSocket handler
          authorize (Editor+)                        (new short-lived DB session per message)
          SELECT … FOR UPDATE  + populate_existing   (row lock; never trust a cached copy)
          archived?            → DOCUMENT_ARCHIVED   (read-only lifecycle state)
          revision != N?       → STALE_REVISION      (carry the current state back)
          nothing changed?     → ack, no new revision (title blur, undo-to-same, etc.)
          else: content=…, revision=N+1, record history, COMMIT
          publish to Redis channel:doc:{id} ──► every instance ──► every connected client
```

Why this is safe:

* `SELECT … FOR UPDATE` makes concurrent writers on one document queue up inside PostgreSQL.
  The second transaction re-reads the *new* revision after the first commits, so it fails its
  own check instead of overwriting.
* `populate_existing` matters: without it the ORM could hand back a cached `Document` with an
  old revision and the check would pass wrongly. (A first version of this project had exactly
  that bug, because a WebSocket kept one DB session alive for the whole connection. Now each
  message gets its own session.)
* Revision + content + history are written in **one transaction**.
* The same service method backs REST `PATCH /documents/{id}` (revision-checked) and restore, so
  there is one set of rules.

Because Redis delivers a channel's messages in order, all clients observe operations in the
same order the database committed them.

## 2. Client: keep both edits (three-way rebase)

Rejecting a stale write is only half the story — a naive client would then *discard* what the
user just typed. Instead the editor tracks three texts (`frontend/src/utils/merge.ts`):

| name   | meaning |
|--------|---------|
| base   | last server-confirmed text (and its revision) |
| local  | what is in the textarea (base + unsent typing) |
| remote | the server's newer text (base + someone else's edit) |

Each side is reduced to one contiguous replaced region relative to `base` (common prefix /
suffix). Then:

* **Regions don't overlap** → both edits are applied. *A edits paragraph 1 while B edits
  paragraph 3: the result contains both.* The caret is shifted so it doesn't jump.
* **Regions overlap** → the local edit wins and is re-sent on top of the new revision; the
  user sees a toast saying their edit overlapped with a collaborator's. The other person's
  version is still in history.

Rules that keep this correct:

1. **At most one operation in flight.** Typing during a round trip is queued and sent when the
   previous operation resolves (accepted echo, `ack`, `stale_revision`, error, or a 5 s timeout).
2. **Own echoes only advance the base.** The server tags broadcasts with the sender's
   `client_id` (`origin`). The sender adopts the revision but never overwrites the textarea with
   an older echo (which would eat keystrokes typed since sending). Another tab of the same user
   has a different `client_id`, so it *is* merged.
3. **Stale response = rebase, then retry.** `stale_revision` carries the current content; the
   client rebases onto it and re-sends. If it already caught up via a broadcast, it simply re-sends.
4. **Old/duplicate operations are ignored** (`revision <= base.revision`).
5. **Reconnect resync.** After a socket drop the client re-fetches the document, rebases any
   unsent edits, and flushes. Offline typing shows "Offline — will sync".
6. **Leaving the page with unsent edits** triggers a `beforeunload` warning and a best-effort
   REST save (also revision-checked).

### Known limits (deliberate)

* One region per side: if you edit two far-apart places inside a single 400 ms debounce window
  *and* someone edits between them, that is treated as an overlap.
* Operations carry the whole document (bounded to ~2 MB per message). Debouncing keeps traffic
  sane; for very large documents you would switch to delta operations.
* This is last-writer-wins within an overlap, not intention-preserving merging. For that, adopt
  a CRDT (e.g. Yjs) — the revision/authorization/history layers would stay the same.

## 3. Version history

History is a set of immutable-once-sealed snapshots (`document_versions`):

* **Seed version (revision 0)** at creation — never modified.
* **One entry per editing session.** Consecutive edits by the *same* user within
  `VERSION_COALESCE_SECONDS` (default 60) update that session's entry in place instead of
  creating a row per pause in typing. A different editor, a time gap, or a restore starts a new
  entry. (`revision` still counts every accepted operation, so history shows e.g. versions
  0, 3, 11 — gaps are normal.)
* **Restore appends.** Restoring version *k* creates a **new** revision with *k*'s content, as
  its own entry. Nothing is rewound or deleted; the pre-restore text remains in history.
* Archived documents cannot be edited or restored.

Trade-off, stated honestly: updating the *open* session in place means the very latest session
is not strictly append-only until it is sealed. Everything older is.

## 4. Workflow state

`draft → in_review → approved`, with `archived` as an off-ramp (and `archived → draft` to
revive). Rules, enforced in `DocumentService.update_meta`:

* Editors and owners can change status/type; viewers and commenters cannot.
* Entering or leaving `approved` is **owner-only** (a lightweight separation of duties).
* Invalid jumps (e.g. `draft → approved`) are rejected with 409.
* `archived` is read-only for content, restore and type changes.
* Every change is audit-logged and pushed live to open editors (`meta` event).

## 5. Multiple backend instances

Nothing about correctness depends on being on the same process: the lock and revision check
live in PostgreSQL; fan-out and presence live in Redis. Presence is keyed per **connection**, so
a user with two tabs stays online until both close; reads de-duplicate by user and drop entries
missing three heartbeats (45 s). The WebSocket manager subscribes to the Redis channel
*before* announcing a joiner, otherwise the first presence broadcast could be missed.
