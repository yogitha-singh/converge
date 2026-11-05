# Converge — API Reference

Interactive docs (development only): `GET /docs` (Swagger) and `/redoc`.
All endpoints except `/health` and `/api/auth/{register,login,refresh}` need
`Authorization: Bearer <access_token>`.

Errors are always `{"detail": …}` where `detail` is a string, a validation list, or an object:

```json
{"detail": {"error": "STALE_REVISION", "current_revision": 4}}
{"detail": {"error": "DOCUMENT_ARCHIVED", "message": "Archived documents are read-only…"}}
```

Status codes you will see: `401` bad/expired token · `403` role too low · `404` not found **or not
a member** (IDs can't be probed) · `409` conflict (stale revision, invalid status transition,
archived, duplicate) · `422` validation · `429` rate limited.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{email, name, password≥8}` — 10/min/IP |
| POST | `/api/auth/login` | returns `{access_token, refresh_token}` — 5/min/IP |
| POST | `/api/auth/refresh` | exchanges a refresh token for a new pair |
| GET | `/api/auth/me` | current user |

## Workspaces
| Method | Path | Role |
|---|---|---|
| POST | `/api/workspaces` | any user (becomes Owner) |
| GET | `/api/workspaces` | member (includes `my_role`) |
| GET / PATCH / DELETE | `/api/workspaces/{id}` | Viewer+ / **Owner** (rename) / **Owner** (delete, cascades) |
| GET | `/api/workspaces/{id}/members` | Viewer+ |
| POST | `/api/workspaces/{id}/members` | **Owner** — `{email, role}`; the user must already have an account |
| PATCH / DELETE | `/api/workspaces/{id}/members/{user_id}` | **Owner** — a workspace must always keep ≥1 owner |
| GET | `/api/workspaces/{id}/activity?limit&offset` | Viewer+ — items include `actor_name` |

Roles: **owner** (manage members, approve, delete) · **editor** (create/edit, comment) ·
**commenter** (read + comment) · **viewer** (read).

## Documents
| Method | Path | Role / notes |
|---|---|---|
| POST | `/api/documents` | Editor+ — `{workspace_id, title, doc_type, content}` |
| GET | `/api/documents?workspace_id=&search=&status=&limit=&offset=` | Viewer+ — search covers title **and** content |
| GET | `/api/documents/{id}` | Viewer+ — includes `status`, `doc_type`, `revision`, `my_role` |
| PATCH | `/api/documents/{id}` | Editor+ — `{title?, content?, revision}`; `409 STALE_REVISION` if outdated |
| PATCH | `/api/documents/{id}/meta` | Editor+ — `{status?, doc_type?}`; approving / leaving *approved* is Owner-only |
| DELETE | `/api/documents/{id}` | **Owner** |
| GET | `/api/documents/{id}/versions?limit&offset` | Viewer+ — includes `edited_by_name` |
| GET | `/api/documents/{id}/versions/{version_id}` | Viewer+ — includes `content` (preview) |
| POST | `/api/documents/{id}/restore` | Editor+ — `{version_id}`; appends a new revision |

`status`: `draft | in_review | approved | archived`.
`doc_type`: `spec | rfc | meeting_notes | sprint_plan`.
Allowed transitions: draft→in_review/archived · in_review→draft/approved/archived ·
approved→in_review/archived · archived→draft.

## Comments
| Method | Path | Role |
|---|---|---|
| GET | `/api/documents/{id}/comments` | Viewer+ (threads include replies, `author_name`) |
| POST | `/api/documents/{id}/comments` | Commenter+ — `{content, range_start?, range_end?, quote?}` (range needs both ends, end>start) |
| POST | `/api/comments/{id}/resolve` · `/reopen` | own comment (Commenter) or any (Editor+) |
| POST | `/api/comments/{id}/replies` | Commenter+ |

`@mentions` — `@SarahJones` (name without spaces) or `@sarah` (email local part). Mentioned
workspace members get a `comment_mention` notification linking to the document. Replying notifies
the comment's author.

## Search
`GET /api/search?q=&limit=` — documents across **all** workspaces you belong to (title + content,
with a content snippet). Powers the Cmd/Ctrl+K palette.

## Notifications
`GET /api/notifications?unread_only=` · `POST /api/notifications/{id}/read` (404 if not yours) ·
`POST /api/notifications/read-all`. Types: `workspace_invite` (reference = workspace id),
`comment_mention`, `comment_reply`, `document_added` (reference = document id).

## Health
`GET /health` → `{"status":"ok|degraded","database":"ok|unreachable","redis":"ok|unreachable"}`.

## WebSocket
`WS /ws/documents/{document_id}?token=<access token>`

Client → server
```json
{"type":"operation","base_revision":3,"content":"…","title":"…","client_id":"<per-tab id>"}
{"type":"cursor","position":120,"selection_start":110,"selection_end":120}
{"type":"heartbeat"}
```
Server → client
```json
{"type":"presence","users":[{"user_id":"…","name":"…","last_seen":1730000000.0}]}
{"type":"operation","revision":4,"content":"…","title":"…","edited_by":"…","edited_by_name":"…","origin":"<client_id | rest | restore>"}
{"type":"ack","revision":3}
{"type":"stale_revision","current_revision":4,"current_content":"…","current_title":"…"}
{"type":"cursor","user_id":"…","name":"…","position":120,"selection_start":110,"selection_end":120}
{"type":"meta","status":"in_review","doc_type":"rfc","changed_by_name":"Sarah"}
{"type":"comment_event","event":"created|replied|resolved|reopened","comment_id":"…"}
{"type":"error","code":403,"message":"…"}
```
Close codes: `4401` bad/expired token (refresh and reconnect) · `4403` no access (don't retry).
Messages over ~2 MB are rejected. Viewers/commenters can connect but get `error 403` on operations.
