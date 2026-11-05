import { FileText, Plus, Search, Trash2, Users } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { type DocumentStatus, type DocumentSummary, deleteDocument, listDocuments } from "../api/documents";
import ActivityFeed from "../components/ActivityFeed";
import { DocTypeIcon, STATUSES, StatusBadge, typeMeta } from "../components/DocMeta";
import MembersModal, { RoleBadge } from "../components/MembersModal";
import NewDocumentModal from "../components/NewDocumentModal";
import { EmptyState, Skeleton, Spinner, cx } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useWorkspaces } from "../context/WorkspaceContext";
import { relativeTime } from "../utils/time";

const PAGE_SIZE = 30;
type Tab = "documents" | "activity";

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [params, setParams] = useSearchParams();
  const { workspaces, loading: workspacesLoading, setActiveId } = useWorkspaces();
  const toast = useToast();

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
  const tab: Tab = params.get("tab") === "activity" ? "activity" : "documents";
  const membersOpen = params.get("members") === "1";
  const newDocOpen = params.get("new") === "1";

  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const requestId = useRef(0);

  const canEdit = workspace?.my_role === "owner" || workspace?.my_role === "editor";
  const isOwner = workspace?.my_role === "owner";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  useEffect(() => {
    if (workspace) setActiveId(workspace.id);
  }, [workspace, setActiveId]);

  useEffect(() => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
  }, [workspaceId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!workspaceId) return [];
      return listDocuments(workspaceId, {
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
        limit: PAGE_SIZE,
        offset,
      });
    },
    [workspaceId, debouncedSearch, status]
  );

  useEffect(() => {
    if (!workspace) return;
    const id = ++requestId.current;
    setLoading(true);
    fetchPage(0)
      .then((rows) => {
        if (id !== requestId.current) return;
        setDocs(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err) => id === requestId.current && toast.error(errorMessage(err)))
      .finally(() => id === requestId.current && setLoading(false));
  }, [workspace, fetchPage, toast]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const rows = await fetchPage(docs.length);
      setDocs((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(doc: DocumentSummary) {
    if (!window.confirm(`Delete “${doc.title}”? Its history and comments are deleted too.`)) return;
    try {
      await deleteDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Document deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (workspacesLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!workspace) {
    return (
      <EmptyState
        icon={<Search size={20} />}
        title="Workspace not found"
        description="It may have been deleted, or you no longer have access."
        action={<Link to="/" className="btn-secondary">Back to home</Link>}
      />
    );
  }

  const filtering = !!debouncedSearch || status !== "all";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900">{workspace.name}</h1>
          <RoleBadge role={workspace.my_role} />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setParam("members", "1")}>
            <Users size={15} /> {isOwner ? "Manage members" : "Members"}
          </button>
          {canEdit && (
            <button className="btn-primary" onClick={() => setParam("new", "1")}>
              <Plus size={15} /> New document
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 flex gap-6 border-b border-zinc-200" role="tablist">
        {(["documents", "activity"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParam("tab", t === "documents" ? null : t)}
            className={cx(
              "-mb-px border-b-2 px-0.5 pb-3 text-sm font-medium capitalize transition-colors",
              tab === t ? "border-brand-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <div className="card"><ActivityFeed workspaceId={workspace.id} /></div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search titles and content…"
                className="input pl-9"
                aria-label="Search documents"
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {[{ value: "all", label: "All" }, ...STATUSES].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value as DocumentStatus | "all")}
                  aria-pressed={status === s.value}
                  className={cx(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                    status === s.value ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            {loading ? (
              <div className="divide-y divide-zinc-100">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                ))}
              </div>
            ) : docs.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} />}
                title={filtering ? "No documents match" : "No documents yet"}
                description={filtering ? "Try a different search or status filter." : canEdit ? "Create your first spec, RFC, meeting notes or sprint plan." : "Nothing here yet."}
                action={!filtering && canEdit ? (
                  <button className="btn-primary" onClick={() => setParam("new", "1")}><Plus size={15} /> New document</button>
                ) : undefined}
              />
            ) : (
              <>
                <div className="hidden grid-cols-[1fr_130px_130px_32px] gap-4 border-b border-zinc-100 bg-zinc-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 sm:grid">
                  <span>Name</span><span>Status</span><span>Updated</span><span />
                </div>
                <ul className="divide-y divide-zinc-100">
                  {docs.map((doc) => (
                    <li key={doc.id} className="group relative">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 hover:bg-zinc-50 sm:grid-cols-[1fr_130px_130px_32px]"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <DocTypeIcon type={doc.doc_type} size={16} boxed />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-zinc-900">{doc.title}</span>
                            <span className="block text-xs text-zinc-400 sm:hidden">{typeMeta(doc.doc_type).label} · {relativeTime(doc.updated_at)}</span>
                            <span className="hidden text-xs text-zinc-400 sm:block">{typeMeta(doc.doc_type).label}</span>
                          </span>
                        </span>
                        <span><StatusBadge status={doc.status} /></span>
                        <span className="hidden text-sm text-zinc-500 sm:block" title={new Date(doc.updated_at).toLocaleString()}>
                          {relativeTime(doc.updated_at)}
                        </span>
                        <span />
                      </Link>
                      {isOwner && (
                        <button
                          onClick={() => handleDelete(doc)}
                          className="btn-icon absolute right-3 top-1/2 hidden -translate-y-1/2 hover:text-red-600 group-hover:inline-flex sm:right-2"
                          aria-label={`Delete ${doc.title}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <div className="border-t border-zinc-100 p-3 text-center">
                    <button className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore && <Spinner size={14} />} Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <MembersModal open={membersOpen} onClose={() => setParam("members", null)} workspace={workspace} />
      <NewDocumentModal open={newDocOpen && canEdit} onClose={() => setParam("new", null)} workspaceId={workspace.id} />
    </div>
  );
}
