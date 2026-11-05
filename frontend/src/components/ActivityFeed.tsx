import { Activity, FilePlus2, FileX2, GitBranch, History, Pencil, Tag, UserCog, UserMinus, UserPlus, type LucideIcon } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type ActivityEntry, listActivity } from "../api/workspaces";
import { dayLabel, relativeTime } from "../utils/time";
import { Avatar, EmptyState, Skeleton, Spinner } from "./ui";

const PAGE_SIZE = 50;

const ICONS: Record<string, LucideIcon> = {
  "document.created": FilePlus2,
  "document.edited": Pencil,
  "document.deleted": FileX2,
  "document.restored": History,
  "document.status_changed": GitBranch,
  "document.type_changed": Tag,
  "member.invited": UserPlus,
  "member.removed": UserMinus,
  "member.role_updated": UserCog,
};

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function groupByDay(entries: ActivityEntry[], now = Date.now()): { label: string; entries: ActivityEntry[] }[] {
  const groups: { label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.created_at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export default function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listActivity(workspaceId, PAGE_SIZE, 0)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const rows = await listActivity(workspaceId, PAGE_SIZE, entries.length);
      setEntries((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [workspaceId, entries.length]);

  if (loading) {
    return (
      <div className="space-y-5 p-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <EmptyState icon={<Activity size={20} />} title="No activity yet" description="Edits, status changes, restores and membership changes will show up here." />;
  }

  return (
    <div className="px-6 py-5">
      {groupByDay(entries).map((group) => (
        <section key={group.label} className="mb-6 last:mb-0">
          <h3 className="section-title mb-3">{group.label}</h3>
          <ol className="relative space-y-1 border-l border-zinc-100 pl-0">
            {group.entries.map((entry) => {
              const Icon = ICONS[entry.action] ?? Activity;
              const clickable = !!entry.document_id && entry.action !== "document.deleted";
              return (
                <li key={entry.id}>
                  <button
                    disabled={!clickable}
                    onClick={() => clickable && navigate(`/documents/${entry.document_id}`)}
                    className="group -ml-px flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left enabled:hover:bg-zinc-50 disabled:cursor-default"
                  >
                    <Avatar name={entry.actor_name} id={entry.actor_id} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug text-zinc-700">
                        <span className="font-semibold text-zinc-900">{entry.actor_name}</span> {lowerFirst(entry.description)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                        <Icon size={12} />
                        <time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>
                          {relativeTime(entry.created_at)}
                        </time>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {hasMore && (
        <div className="pt-2 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="btn-secondary">
            {loadingMore ? <Spinner size={14} /> : null} Load older activity
          </button>
        </div>
      )}
    </div>
  );
}
