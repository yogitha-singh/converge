import React from "react";
import type { CursorInfo } from "../../hooks/useDocumentSocket";
import { getCaretCoordinates } from "../../utils/caretPosition";
import { colorForUser } from "../../utils/colors";

/** Renders collaborators' carets (and selections as a caret + name flag) over the textarea. */
export default function CursorOverlay({
  textareaRef,
  cursors,
  currentUserId,
  content,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  cursors: Record<string, CursorInfo>;
  currentUserId: string | undefined;
  /** Not used directly; passing it re-renders the overlay (and re-measures) when the text changes. */
  content: string;
}) {
  const textarea = textareaRef.current;
  if (!textarea) return null;
  const others = Object.values(cursors).filter((c) => c.user_id !== currentUserId && c.position !== null);
  if (others.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" data-length={content.length}>
      {others.map((cursor) => {
        const coords = getCaretCoordinates(textarea, cursor.position!);
        const color = colorForUser(cursor.user_id);
        return (
          <div key={cursor.user_id} className="absolute transition-all duration-150 ease-out" style={{ top: coords.top, left: coords.left }}>
            <div className="w-0.5 rounded-full" style={{ height: coords.height, backgroundColor: color }} />
            <div
              className="-mt-px whitespace-nowrap rounded-b rounded-tr px-1.5 py-0.5 text-[10px] font-medium leading-none text-white shadow-card"
              style={{ backgroundColor: color }}
            >
              {cursor.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
