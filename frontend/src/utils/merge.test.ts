import { describe, expect, it } from "vitest";
import { diffRegion, mapCaret, rebase } from "./merge";

describe("diffRegion", () => {
  it("returns null for identical text", () => {
    expect(diffRegion("same", "same")).toBeNull();
  });
  it("describes an insertion", () => {
    expect(diffRegion("hello world", "hello brave world")).toEqual({ start: 6, baseEnd: 6, text: "brave " });
  });
  it("describes a deletion", () => {
    expect(diffRegion("hello brave world", "hello world")).toEqual({ start: 6, baseEnd: 12, text: "" });
  });
  it("describes a replacement", () => {
    expect(diffRegion("a cat sat", "a dog sat")).toEqual({ start: 2, baseEnd: 5, text: "dog" });
  });
});

describe("rebase", () => {
  const base = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";

  it("keeps BOTH edits when they touch different paragraphs (local first)", () => {
    const local = base.replace("one", "ONE");
    const remote = base.replace("three", "THREE");
    const result = rebase(base, local, remote);
    expect(result.conflict).toBe(false);
    expect(result.text).toBe("Paragraph ONE.\n\nParagraph two.\n\nParagraph THREE.");
  });

  it("keeps BOTH edits when the remote edit comes first in the text", () => {
    const local = base.replace("three", "THREE");
    const remote = base.replace("one", "ONE");
    const result = rebase(base, local, remote);
    expect(result.conflict).toBe(false);
    expect(result.text).toBe("Paragraph ONE.\n\nParagraph two.\n\nParagraph THREE.");
  });

  it("adopts the remote text when there is no local edit", () => {
    expect(rebase(base, base, "remote")).toEqual({ text: "remote", conflict: false });
  });

  it("keeps the local text when the remote did not change anything", () => {
    expect(rebase(base, "local", base)).toEqual({ text: "local", conflict: false });
  });

  it("flags overlapping edits and lets the local edit win", () => {
    const local = base.replace("two", "2 (mine)");
    const remote = base.replace("two", "2 (theirs)");
    expect(rebase(base, local, remote)).toEqual({ text: local, conflict: true });
  });

  it("handles two inserts at different ends of the document", () => {
    const result = rebase("middle", "start middle", "middle end");
    expect(result).toEqual({ text: "start middle end", conflict: false });
  });
});

describe("mapCaret", () => {
  it("shifts the caret when a remote edit lands before it", () => {
    const base = "abcdef";
    const remote = "XXabcdef"; // +2 chars at the start
    expect(mapCaret(4, base, base, remote)).toBe(6);
  });
  it("leaves the caret alone when the remote edit is after it", () => {
    const base = "abcdef";
    const remote = "abcdefXX";
    expect(mapCaret(2, base, base, remote)).toBe(2);
  });
  it("accounts for the local edit when locating the remote one", () => {
    const base = "one two three";
    const local = "ONE-ONE two three"; // local grew by 4 before the remote edit
    const remote = "one two THREE!!";
    const merged = rebase(base, local, remote).text;
    expect(merged).toBe("ONE-ONE two THREE!!");
    expect(mapCaret(local.length, base, local, remote)).toBe(merged.length);
  });
});
