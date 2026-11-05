import { describe, expect, it } from "vitest";
import { activeMentionQuery, handleFor, handlesOf, splitMentions } from "./mentions";

describe("handles", () => {
  it("strips spaces from names", () => {
    expect(handleFor("Sarah Jones")).toBe("SarahJones");
  });
  it("matches the backend: name-without-spaces and email local part, lowercased", () => {
    expect(handlesOf({ name: "Sarah Jones", email: "sarah.j@example.com" })).toEqual(["sarahjones", "sarah.j"]);
  });
});

describe("splitMentions", () => {
  const valid = new Set(["bish", "sarahjones"]);
  it("marks only real members as mentions", () => {
    expect(splitMentions("hey @Bish and @nobody", valid)).toEqual([
      { text: "hey ", mention: false },
      { text: "@Bish", mention: true },
      { text: " and ", mention: false },
      { text: "@nobody", mention: false },
    ]);
  });
  it("returns plain text untouched", () => {
    expect(splitMentions("no mentions", valid)).toEqual([{ text: "no mentions", mention: false }]);
  });
});

describe("activeMentionQuery", () => {
  it("detects an in-progress mention at the caret", () => {
    expect(activeMentionQuery("hi @bi", 6)).toEqual({ start: 3, query: "bi" });
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });
  it("ignores @ inside a word (e.g. an email) and finished mentions", () => {
    expect(activeMentionQuery("mail me at a@b", 14)).toBeNull();
    expect(activeMentionQuery("hi @bish thanks", 15)).toBeNull();
  });
});
