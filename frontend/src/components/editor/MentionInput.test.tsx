import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Member } from "../../api/workspaces";
import MentionInput, { MentionText } from "./MentionInput";

const members: Member[] = [
  { id: "m1", user_id: "u1", email: "bish@example.com", name: "Bish", role: "editor" },
  { id: "m2", user_id: "u2", email: "sarah@example.com", name: "Sarah Jones", role: "commenter" },
];

function Harness({ onValue }: { onValue?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <MentionInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      members={members}
      ariaLabel="Comment"
    />
  );
}

function typeInto(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
}

describe("MentionInput", () => {
  it("suggests members while typing an @mention", () => {
    render(<Harness />);
    typeInto(screen.getByLabelText("Comment"), "hey @sa");
    expect(screen.getByRole("option", { name: /Sarah Jones/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Bish/ })).toBeNull();
  });

  it("inserts the name-without-spaces handle when a suggestion is chosen", () => {
    let latest = "";
    render(<Harness onValue={(v) => (latest = v)} />);
    typeInto(screen.getByLabelText("Comment"), "cc @sa");
    fireEvent.mouseDown(screen.getByRole("option", { name: /Sarah Jones/ }));
    expect(latest).toBe("cc @SarahJones ");
  });

  it("shows no suggestions for a plain email address", () => {
    render(<Harness />);
    typeInto(screen.getByLabelText("Comment"), "write to a@b");
    expect(screen.queryByRole("option")).toBeNull();
  });
});

describe("MentionText", () => {
  it("highlights only mentions of real members", () => {
    render(<p data-testid="t"><MentionText text="hi @Bish and @ghost" members={members} /></p>);
    const mentions = Array.from(document.querySelectorAll("span.font-medium")).map((n) => n.textContent);
    expect(mentions).toEqual(["@Bish"]);
    expect(screen.getByTestId("t").textContent).toBe("hi @Bish and @ghost");
  });
});
