import { ChevronDown, ChevronRight, History as HistoryIcon, RotateCcw } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import {
  type Document,
  type DocumentVersion,
  getVersion,
  listVersions,
  restoreVersion,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { relativeTime } from "../../utils/time";
import { Avatar, EmptyState, Spinner, cx } from "../ui";

const PREVIEW_CHARS = 700;

export default function VersionHistory({
  documentId,
  currentRevision,
  canRestore,
  onRestored,
}: {
  documentId: string;
  currentRevision: number;
  canRestore: boolean;
  onRestored: (doc: Document) => void;
}) {
  const toast = useToast();
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [, tick] = useState(0);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      setVersions(await listVersions(documentId));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [documentId, toast]);

  // Load immediately the first time, then refresh (debounced) as new revisions arrive.
  useEffect(() => {
    const delay = loadedOnce.current ? 1500 : 0;
    loadedOnce.current = true;
    const t = window.setTimeout(load, delay);
    return () => window.clearTimeout(t);
  }, [load, currentRevision]);

  // Keep "2 mins ago" labels fresh.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  async function togglePreview(v: DocumentVersion) {
    if (expanded === v.id) {
      setExpanded(null);
      setConfirming(null);
      return;
    }
    setExpanded(v.id);
    setConfirming(null);
    if (previews[v.id] === undefined) {
      try {
        const detail = await getVersion(documentId, v.id);
        setPreviews((p) => ({ ...p, [v.id]: detail.content }));
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }
  }

  async function handleRestore(v: DocumentVersion) {
    setRestoring(v.id);
    try {
      const doc = await restoreVersion(documentId, v.id);
      toast.success(`Restored version ${v.revision}`);
      setConfirming(null);
      setExpanded(null);
      onRestored(doc);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRestoring(null);
    }
  }

  if (versions === null) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (versions.length === 0) {
    return <EmptyState icon={<HistoryIcon size={18} />} title="No history yet" description="Versions appear here as the document is edited." />;
  }

  return (
    <ol className="p-2">
      {versions.map((v, i) => {
        const isCurrent = i === 0 && v.revision >= currentRevision;
        const open = expanded === v.id;
        const preview = previews[v.id];
        return (
          <li key={v.id} className="relative">
            <button
              onClick={() => togglePreview(v)}
              aria-expanded={open}
              className={cx("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", open ? "bg-zinc-50" : "hover:bg-zinc-50")}
            >
              <Avatar name={v.edited_by_name} id={v.edited_by} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">Version {v.revision}</span>
                  {isCurrent && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">Current</span>}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {v.edited_by_name} · <span title={new Date(v.created_at).toLocaleString()}>{relativeTime(v.created_at)}</span>
                </span>
              </span>
              {open ? <ChevronDown size={15} className="mt-1 text-zinc-400" /> : <ChevronRight size={15} className="mt-1 text-zinc-400" />}
            </button>

            {open && (
              <div className="mx-3 mb-2 animate-fade-in space-y-3">
                <div className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600">
                  {preview === undefined ? (
                    <Spinner size={14} />
                  ) : preview.length === 0 ? (
                    <span className="italic text-zinc-400">(empty)</span>
                  ) : (
                    <>
                      {preview.slice(0, PREVIEW_CHARS)}
                      {preview.length > PREVIEW_CHARS && <span className="text-zinc-400"> … {preview.length - PREVIEW_CHARS} more characters</span>}
                    </>
                  )}
                </div>
                {canRestore && !isCurrent &&
                  (confirming === v.id ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs text-amber-900">
                        Restore version {v.revision}? The current text isn't lost — it stays in history as its own version.
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button className="btn-primary h-7 px-2.5 text-xs" onClick={() => handleRestore(v)} disabled={restoring === v.id}>
                          {restoring === v.id && <Spinner size={12} className="text-white/80" />} Restore
                        </button>
                        <button className="btn-ghost h-7 px-2.5 text-xs" onClick={() => setConfirming(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn-secondary h-7 px-2.5 text-xs" onClick={() => setConfirming(v.id)}>
                      <RotateCcw size={13} /> Restore this version
                    </button>
                  ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
