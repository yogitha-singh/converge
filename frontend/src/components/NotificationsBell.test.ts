import { describe, expect, it } from "vitest";
import type { Notification } from "../api/notifications";
import { notificationTarget } from "./NotificationsBell";

const base: Notification = { id: "n", type: "comment_mention", message: "m", reference_id: "abc", read: false, created_at: "" };

describe("notificationTarget", () => {
  it("deep-links invites to the workspace", () => {
    expect(notificationTarget({ ...base, type: "workspace_invite" })).toBe("/w/abc");
  });
  it("deep-links mentions and replies to the document", () => {
    expect(notificationTarget({ ...base, type: "comment_mention" })).toBe("/documents/abc");
    expect(notificationTarget({ ...base, type: "comment_reply" })).toBe("/documents/abc");
  });
  it("has no target without a reference", () => {
    expect(notificationTarget({ ...base, reference_id: null })).toBeNull();
  });
});
