import { AtSign, Bell, FileText, MessageSquare, UserPlus } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type Notification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications";
import { relativeTime } from "../utils/time";
import { cx, useClickOutside } from "./ui";

const META: Record<Notification["type"], { label: string; icon: React.ReactNode; tint: string }> = {
  workspace_invite: { label: "Workspace invite", icon: <UserPlus size={14} />, tint: "bg-emerald-50 text-emerald-600" },
  document_added: { label: "Document access", icon: <FileText size={14} />, tint: "bg-indigo-50 text-indigo-600" },
  comment_mention: { label: "Mention", icon: <AtSign size={14} />, tint: "bg-amber-50 text-amber-600" },
  comment_reply: { label: "Reply", icon: <MessageSquare size={14} />, tint: "bg-violet-50 text-violet-600" },
};

const POLL_INTERVAL_MS = 20000;

export function notificationTarget(n: Notification): string | null {
  if (!n.reference_id) return null;
  return n.type === "workspace_invite" ? `/w/${n.reference_id}` : `/documents/${n.reference_id}`;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const refresh = useCallback(async () => {
    try {
      setNotifications(await listNotifications());
    } catch {
      /* background poll: ignore transient failures */
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  async function handleOpenNotification(n: Notification) {
    setOpen(false);
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markNotificationRead(n.id).catch(() => undefined);
    }
    const target = notificationTarget(n);
    if (target) navigate(target);
  }

  async function handleMarkAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead().catch(() => undefined);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button onClick={() => setOpen((o) => !o)} className="btn-icon relative" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-scale-in overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <span className="text-sm font-semibold text-zinc-900">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Bell size={20} className="mx-auto mb-2 text-zinc-300" />
                <p className="text-sm text-zinc-500">You're all caught up.</p>
              </div>
            )}
            {notifications.map((n) => {
              const meta = META[n.type];
              return (
                <button
                  key={n.id}
                  onClick={() => handleOpenNotification(n)}
                  className={cx("flex w-full items-start gap-3 border-b border-zinc-50 px-4 py-3 text-left last:border-0 hover:bg-zinc-50", n.read && "opacity-60")}
                >
                  <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", meta.tint)}>{meta.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-zinc-800">{n.message}</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">{relativeTime(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
