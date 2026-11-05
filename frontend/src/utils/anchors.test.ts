import { describe, expect, it } from "vitest";
import { buildSegments, resolveAnchor } from "./anchors";

const anchor = (s: number | null, e: number | null, quote: string | null) => ({ range_start: s, range_end: e, quote });

describe("resolveAnchor", () => {
  it("uses the stored offsets while the quoted text is still there", () => {
    expect(resolveAnchor("hello brave world", anchor(6, 11, "brave"))).toEqual({ start: 6, end: 11 });
  });
  it("re-finds the quote after text was inserted before it", () => {
    expect(resolveAnchor("INSERTED hello brave world", anchor(6, 11, "brave"))).toEqual({ start: 15, end: 20 });
  });
  it("picks the occurrence nearest the original offset", () => {
    const content = "cat ... cat ... cat";
    expect(resolveAnchor(content, anchor(8, 11, "dog"))).toBeNull();
    expect(resolveAnchor("cat x cat x cat", anchor(6, 9, "cat"))).toEqual({ start: 6, end: 9 });
    expect(resolveAnchor("xx cat x cat x cat", anchor(5, 8, "cat"))).toEqual({ start: 3, end: 6 });
  });
  it("returns null when the quoted text was deleted", () => {
    expect(resolveAnchor("nothing here", anchor(0, 5, "brave"))).toBeNull();
  });
  it("returns null for comments without a range", () => {
    expect(resolveAnchor("text", anchor(null, null, null))).toBeNull();
  });
  it("falls back to raw offsets when there is no quote and they are in bounds", () => {
    expect(resolveAnchor("0123456789", anchor(2, 5, null))).toEqual({ start: 2, end: 5 });
    expect(resolveAnchor("0123", anchor(2, 9, null))).toBeNull();
  });
});

describe("buildSegments", () => {
  it("splits content around highlighted ranges", () => {
    const segments = buildSegments("hello brave world", [{ id: "c1", start: 6, end: 11, resolved: false }]);
    expect(segments).toEqual([
      { text: "hello " },
      { text: "brave", commentId: "c1", resolved: false },
      { text: " world" },
    ]);
  });
  it("skips overlapping ranges instead of corrupting the text", () => {
    const segments = buildSegments("abcdefghij", [
      { id: "a", start: 0, end: 5, resolved: false },
      { id: "b", start: 3, end: 8, resolved: false },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("abcdefghij");
    expect(segments.filter((s) => s.commentId).map((s) => s.commentId)).toEqual(["a"]);
  });
  it("returns the whole text when there are no anchors", () => {
    expect(buildSegments("plain", [])).toEqual([{ text: "plain" }]);
  });
});
