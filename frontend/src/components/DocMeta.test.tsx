import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { ALLOWED_TRANSITIONS, StatusBadge, StatusMenu, transitionBlockedReason } from "./DocMeta";

describe("transitionBlockedReason (mirrors the backend workflow rules)", () => {
  it("allows the normal lifecycle for editors", () => {
    expect(transitionBlockedReason("draft", "in_review", "editor")).toBeNull();
    expect(transitionBlockedReason("in_review", "draft", "editor")).toBeNull();
    expect(transitionBlockedReason("draft", "archived", "editor")).toBeNull();
  });

  it("rejects transitions that skip the review step", () => {
    expect(transitionBlockedReason("draft", "approved", "owner")).toMatch(/Can't go from Draft to Approved/);
  });

  it("reserves approving (and un-approving) for owners", () => {
    expect(transitionBlockedReason("in_review", "approved", "editor")).toMatch(/owner/i);
    expect(transitionBlockedReason("in_review", "approved", "owner")).toBeNull();
    expect(transitionBlockedReason("approved", "in_review", "editor")).toMatch(/owner/i);
  });

  it("blocks viewers and commenters from changing status at all", () => {
    expect(transitionBlockedReason("draft", "in_review", "viewer")).toMatch(/permission/i);
    expect(transitionBlockedReason("draft", "in_review", "commenter")).toMatch(/permission/i);
  });

  it("only lets archived documents return to draft", () => {
    expect(ALLOWED_TRANSITIONS.archived).toEqual(["draft"]);
  });
});

describe("StatusBadge", () => {
  it("shows a human label", () => {
    render(<StatusBadge status="in_review" />);
    expect(screen.getByText("In Review")).toBeInTheDocument();
  });
});

describe("StatusMenu", () => {
  it("is a plain badge (no menu) for read-only roles", () => {
    render(<StatusMenu status="draft" role="viewer" onChange={() => undefined} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("lets an editor pick a valid next status", () => {
    const onChange = vi.fn();
    render(<StatusMenu status="draft" role="editor" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /draft/i }));
    fireEvent.click(screen.getByRole("option", { name: "In Review" }));
    expect(onChange).toHaveBeenCalledWith("in_review");
  });

  it("disables moves the user isn't allowed to make", () => {
    render(<StatusMenu status="in_review" role="editor" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /in review/i }));
    expect(screen.getByRole("option", { name: "Approved" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Draft" })).toBeEnabled();
  });
});
