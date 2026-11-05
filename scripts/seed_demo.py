#!/usr/bin/env python3
"""
Populate a running Converge instance with a realistic demo workspace.

    python scripts/seed_demo.py                       # against http://localhost:8000
    python scripts/seed_demo.py --api http://host:8000

Uses only the public REST API (stdlib only), so it exercises the same permission and
workflow rules as the app. Safe to re-run: it reuses existing users and creates a new
"Engineering (demo)" workspace each time. All demo accounts use the password `password123`.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

PASSWORD = "password123"
USERS = [
    ("alice@example.com", "Alice Chen"),     # workspace owner
    ("bish@example.com", "Bish Rahman"),     # editor
    ("sarah@example.com", "Sarah Jones"),    # commenter
]


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")

    def call(self, method: str, path: str, body=None, token: str | None = None, ok=(200, 201, 204)):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            if err.code in ok:
                return None
            detail = err.read().decode()
            raise SystemExit(f"{method} {path} -> {err.code}: {detail}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    api = Api(parser.parse_args().api)

    tokens = {}
    for email, name in USERS:
        api.call("POST", "/api/auth/register", {"email": email, "name": name, "password": PASSWORD}, ok=(409,))
        tokens[email] = api.call("POST", "/api/auth/login", {"email": email, "password": PASSWORD})["access_token"]
    alice, bish, sarah = (tokens[e] for e, _ in USERS)

    ws = api.call("POST", "/api/workspaces", {"name": "Engineering (demo)"}, alice)["id"]
    api.call("POST", f"/api/workspaces/{ws}/members", {"email": "bish@example.com", "role": "editor"}, alice)
    api.call("POST", f"/api/workspaces/{ws}/members", {"email": "sarah@example.com", "role": "commenter"}, alice)

    def make(title, doc_type, content, token=alice):
        doc = api.call("POST", "/api/documents", {"workspace_id": ws, "title": title, "doc_type": doc_type}, token)
        api.call("PATCH", f"/api/documents/{doc['id']}", {"content": content, "revision": 0}, token)
        return doc["id"]

    def status(doc_id, *steps, token=alice):
        for s in steps:
            api.call("PATCH", f"/api/documents/{doc_id}/meta", {"status": s}, token)

    api_arch = make(
        "API Architecture", "spec",
        "# API Architecture\n\n## Goals\nA small, boring API that supports real-time collaboration.\n\n"
        "## Transport\nREST for CRUD and WebSockets for live editing. Every write carries the revision it was "
        "based on, so the server can reject stale updates instead of silently overwriting.\n\n"
        "## Persistence\nPostgreSQL is the source of truth. Redis holds presence and pub/sub only.\n",
    )
    status(api_arch, "in_review", token=bish)

    rfc = make(
        "RFC: Token Rotation", "rfc",
        "# RFC: Refresh-token rotation\n\n## Problem\nA leaked refresh token is valid for seven days.\n\n"
        "## Proposal\nRotate refresh tokens on every use and revoke the family on reuse.\n\n"
        "## Open questions\n- Where do we store token families?\n- How do we handle clock skew?\n",
        token=bish,
    )

    capacity = make("Q4 Capacity Plan", "spec", "# Q4 Capacity Plan\n\nProjected load is 3x. We need two more API instances and a Postgres replica.\n")
    status(capacity, "in_review", "approved")

    make(
        "Sprint 14 Plan", "sprint_plan",
        "# Sprint 14\n\n## Goal\nShip the command palette and document workflow.\n\n## Scope\n- Status lifecycle\n- Cmd+K\n- Audit log\n",
    )
    make(
        "Weekly Sync — Oct 28", "meeting_notes",
        "# Weekly Sync\n\n**Attendees:** Alice, Bish, Sarah\n\n## Notes\n- Reviewed the API architecture draft\n"
        "- Decided to rotate refresh tokens\n\n## Action items\n- Bish: write the rotation RFC\n- Sarah: review the capacity plan\n",
        token=bish,
    )
    legacy = make("Legacy Billing Notes", "spec", "Superseded by the new billing service.\n")
    status(legacy, "archived")

    # Anchored comment + mention + reply + resolved thread.
    text = "Every write carries the revision it was based on"
    content = api.call("GET", f"/api/documents/{api_arch}", token=alice)["content"]
    start = content.index(text)
    thread = api.call(
        "POST", f"/api/documents/{api_arch}/comments",
        {"content": "@alice should we also document the stale-revision error shape here?",
         "range_start": start, "range_end": start + len(text), "quote": text},
        sarah,
    )
    api.call("POST", f"/api/comments/{thread['id']}/replies", {"content": "Good call — adding an example to the API reference."}, alice)

    done = api.call("POST", f"/api/documents/{api_arch}/comments", {"content": "Typo in the Goals section?"}, sarah)
    api.call("POST", f"/api/comments/{done['id']}/resolve", token=sarah)

    api.call("POST", f"/api/documents/{rfc}/comments", {"content": "@alice could you review this before Thursday?"}, bish)

    print("Seeded demo data.\n")
    print("Sign in at http://localhost:5173 with any of:")
    for email, name in USERS:
        print(f"  {email:<20} {PASSWORD}   ({name})")
    print("\nTip: open two browsers as different users on 'API Architecture' to see live cursors,")
    print("or press Ctrl/Cmd+K to try the command palette.")


if __name__ == "__main__":
    sys.exit(main())
