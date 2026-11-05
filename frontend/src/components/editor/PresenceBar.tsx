import React from "react";
import type { PresenceUser, SocketStatus } from "../../hooks/useDocumentSocket";
import { Avatar, cx } from "../ui";

const MAX_VISIBLE = 4;

export default function PresenceBar({
  users,
  currentUserId,
  status,
}: {
  users: PresenceUser[];
  currentUserId?: string;
  status: SocketStatus;
}) {
  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - visible.length;

  const indicator =
    status === "open"
      ? { dot: "bg-emerald-500", label: "Live", text: "text-emerald-700" }
      : status === "denied"
        ? { dot: "bg-red-500", label: "No live access", text: "text-red-700" }
        : { dot: "bg-amber-500 animate-pulse", label: "Reconnecting…", text: "text-amber-700" };

  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2" aria-label={`${users.length} viewing`}>
        {visible.map((u) => (
          <Avatar
            key={u.user_id}
            name={u.user_id === currentUserId ? `${u.name} (you)` : u.name}
            id={u.user_id}
            size="md"
            ring
          />
        ))}
        {overflow > 0 && (
          <span
            title={users.slice(MAX_VISIBLE).map((u) => u.name).join(", ")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 ring-2 ring-white"
          >
            +{overflow}
          </span>
        )}
      </div>
      <span className={cx("hidden items-center gap-1.5 text-xs font-medium lg:inline-flex", indicator.text)} role="status">
        <span className={cx("h-1.5 w-1.5 rounded-full", indicator.dot)} />
        {indicator.label}
      </span>
    </div>
  );
}
