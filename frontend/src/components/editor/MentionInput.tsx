import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "../../api/workspaces";
import { activeMentionQuery, handleFor, handlesOf, splitMentions } from "../../utils/mentions";
import { Avatar, cx } from "../ui";

/** Renders comment text with valid @mentions styled. */
export function MentionText({ text, members }: { text: string; members: Member[] }) {
  const valid = useMemo(() => new Set(members.flatMap((m) => handlesOf(m))), [members]);
  return (
    <>
      {splitMentions(text, valid).map((part, i) =>
        part.mention ? (
          <span key={i} className="rounded bg-brand-50 px-1 font-medium text-brand-700">{part.text}</span>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}

/** A textarea with @mention autocomplete. Cmd/Ctrl+Enter submits. */
export default function MentionInput({
  value,
  onChange,
  members,
  placeholder,
  rows = 2,
  autoFocus = false,
  disabled = false,
  onSubmit,
  inputRef,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  ariaLabel: string;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const mention = activeMentionQuery(value, caret);
  const options = useMemo(() => {
    if (!mention || dismissedAt === mention.start) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => !q || handleFor(m.name).toLowerCase().startsWith(q) || m.name.toLowerCase().includes(q) || m.email.toLowerCase().startsWith(q))
      .slice(0, 5);
  }, [mention, members, dismissedAt]);

  useEffect(() => setIndex(0), [options.length, mention?.query]);

  function pick(member: Member) {
    if (!mention) return;
    const handle = handleFor(member.name);
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const next = `${before}@${handle} ${after}`;
    const nextCaret = before.length + handle.length + 2;
    onChange(next);
    window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    }, 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (options.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => (i + 1) % options.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (i - 1 + options.length) % options.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[index]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissedAt(mention?.start ?? null); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative">
      {options.length > 0 && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 w-64 animate-scale-in overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-pop" role="listbox">
          {options.map((m, i) => (
            <li key={m.user_id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                onMouseMove={() => setIndex(i)}
                className={cx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left", i === index ? "bg-brand-50" : "hover:bg-zinc-50")}
              >
                <Avatar name={m.name} id={m.user_id} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-900">{m.name}</span>
                  <span className="block truncate text-xs text-zinc-500">@{handleFor(m.name)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setDismissedAt(null); }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={onKeyDown}
        className="input resize-none"
      />
    </div>
  );
}
