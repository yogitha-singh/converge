import React, { useEffect, useLayoutEffect } from "react";
import type { Segment } from "../../utils/anchors";
import { cx } from "../ui";

/**
 * A plain <textarea> with comment highlights drawn *behind* it.
 *
 * The backdrop renders the same text with identical metrics (`.editor-surface`), made
 * transparent except for <mark> backgrounds, so highlights line up exactly with the text above.
 * The textarea auto-grows, so the page (not the textarea) scrolls and the two never drift.
 */
export default function HighlightedEditor({
  value,
  onChange,
  readOnly,
  segments,
  activeCommentId,
  textareaRef,
  onSelect,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  segments: Segment[];
  activeCommentId: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(resize, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-[60vh]">
      <div aria-hidden className="editor-surface pointer-events-none absolute inset-0 overflow-hidden text-transparent">
        {segments.map((seg, i) =>
          seg.commentId ? (
            <mark
              key={i}
              className={cx(
                "rounded-[3px] text-transparent",
                seg.commentId === activeCommentId
                  ? "bg-amber-300/80 ring-1 ring-amber-400"
                  : seg.resolved
                    ? "bg-zinc-200/70"
                    : "bg-amber-200/70"
              )}
            >
              {seg.text}
            </mark>
          ) : (
            <React.Fragment key={i}>{seg.text}</React.Fragment>
          )
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onSelect={onSelect}
        onKeyUp={onSelect}
        onClick={onSelect}
        spellCheck
        aria-label="Document content"
        placeholder={readOnly ? "" : "Start writing…"}
        className="editor-surface relative z-[1] block min-h-[60vh] w-full resize-none overflow-hidden bg-transparent text-zinc-800 placeholder:text-zinc-300 focus:outline-none"
      />
      {children}
    </div>
  );
}
