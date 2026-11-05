import {
  AlertTriangle, ArrowLeft, Check, CloudOff, Eye, History as HistoryIcon, Lock, MessageSquare, MessageSquarePlus, Share2, X,
} from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, errorMessage } from "../api/client";
import {
  type Comment, type Document, type DocumentStatus, type DocumentType,
  getDocument, listComments, updateDocument, updateDocumentMeta,
} from "../api/documents";
import { type Member, type WorkspaceRole, listMembers } from "../api/workspaces";
import { StatusMenu, TypeMenu, statusMeta, typeMeta } from "../components/DocMeta";
import CommentsPanel, { type PendingAnchor } from "../components/editor/CommentsPanel";
import CursorOverlay from "../components/editor/CursorOverlay";
import HighlightedEditor from "../components/editor/HighlightedEditor";
import PresenceBar from "../components/editor/PresenceBar";
import VersionHistory from "../components/editor/VersionHistory";
import MembersModal from "../components/MembersModal";
import { EmptyState, Skeleton, Spinner, cx } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWorkspaces } from "../context/WorkspaceContext";
import {
  type CursorInfo, type MetaMessage, type OperationMessage, type PresenceUser,
  type ServerErrorMessage, type StaleMessage, useDocumentSocket,
} from "../hooks/useDocumentSocket";
import { type AnchoredRange, buildSegments, resolveAnchor } from "../utils/anchors";
import { getCaretCoordinates } from "../utils/caretPosition";
import { mapCaret, rebase } from "../utils/merge";

const DEBOUNCE_MS = 400;
const CURSOR_THROTTLE_MS = 150;
const INFLIGHT_TIMEOUT_MS = 5000;

type Panel = "comments" | "history" | null;
type SaveState = "saved" | "dirty" | "saving" | "offline";
interface Base { revision: number; content: string; title: string }

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function DocumentEditor() {
  const { documentId = "" } = useParams<{ documentId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const { workspaces, setActiveId } = useWorkspaces();

  const [doc, setDoc] = useState<Document | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<DocumentStatus>("draft");
  const [docType, setDocType] = useState<DocumentType>("spec");
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorInfo>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [panel, setPanel] = useState<Panel>(() => (typeof window !== "undefined" && window.innerWidth >= 1024 ? "comments" : null));
  const [unreadComments, setUnreadComments] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [selectionRequest, setSelectionRequest] = useState<{ id: number; range: [number, number] } | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  const clientId = useRef(makeId()).current;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef("");
  const titleRef = useRef("");
  const baseRef = useRef<Base>({ revision: 0, content: "", title: "" });
  const inFlightRef = useRef(false);
  const inFlightTimer = useRef<number>();
  const debounceTimer = useRef<number>();
  const cursorTimer = useRef<number | null>(null);
  const ignoreMetaUntil = useRef(0);
  const selectionCounter = useRef(0);
  const canEditRef = useRef(false);

  const isArchived = status === "archived";
  const canEdit = (role === "owner" || role === "editor") && !isArchived;
  const canComment = role !== null && role !== "viewer";
  canEditRef.current = canEdit;
  const workspace = workspaces.find((w) => w.id === doc?.workspace_id) ?? null;

  // ------------------------------------------------------------------ local state helpers

  const setBase = (next: Base) => {
    baseRef.current = next;
    setRevision(next.revision);
  };
  const updateContent = (next: string, range?: [number, number]) => {
    contentRef.current = next;
    setContent(next);
    if (range) setSelectionRequest({ id: ++selectionCounter.current, range });
  };
  const updateTitle = (next: string) => {
    titleRef.current = next;
    setTitle(next);
  };

  // Put the caret back after a remote edit replaced the textarea value (React moves it to the end).
  useLayoutEffect(() => {
    if (!selectionRequest) return;
    const ta = textareaRef.current;
    if (ta && document.activeElement === ta) ta.setSelectionRange(selectionRequest.range[0], selectionRequest.range[1]);
  }, [selectionRequest]);

  // ------------------------------------------------------------------ sync engine
  //
  // baseRef   = last server-confirmed state (revision, content, title)
  // contentRef/titleRef = what the user sees now (base + unsent local edits)
  // At most one operation is in flight; edits typed meanwhile are sent when it resolves.

  function scheduleFlush(delay: number) {
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(flush, delay);
  }

  function flush() {
    if (!canEditRef.current) return;
    const base = baseRef.current;
    if (contentRef.current === base.content && titleRef.current === base.title) {
      setSaveState("saved");
      return;
    }
    if (inFlightRef.current) return; // re-flushed from afterResolved()
    const sent = sendOperation(base.revision, contentRef.current, titleRef.current, clientId);
    if (!sent) {
      setSaveState("offline");
      return;
    }
    inFlightRef.current = true;
    setSaveState("saving");
    window.clearTimeout(inFlightTimer.current);
    inFlightTimer.current = window.setTimeout(() => {
      inFlightRef.current = false; // no answer: assume lost, try again
      flush();
    }, INFLIGHT_TIMEOUT_MS);
  }

  function afterResolved() {
    inFlightRef.current = false;
    window.clearTimeout(inFlightTimer.current);
    const base = baseRef.current;
    if (contentRef.current !== base.content || titleRef.current !== base.title) scheduleFlush(0);
    else setSaveState("saved");
  }

  /** Merge a newer server state into what the user has locally, keeping unsent edits. */
  function applyRemote(nextRevision: number, remoteContent: string, remoteTitle: string, byName?: string) {
    const base = baseRef.current;
    const local = contentRef.current;
    const { text, conflict } = rebase(base.content, local, remoteContent);

    let range: [number, number] | undefined;
    const ta = textareaRef.current;
    if (ta && document.activeElement === ta && !conflict && text !== local) {
      range = [
        mapCaret(ta.selectionStart, base.content, local, remoteContent),
        mapCaret(ta.selectionEnd, base.content, local, remoteContent),
      ];
    }

    const titleDirty = titleRef.current !== base.title;
    setBase({ revision: nextRevision, content: remoteContent, title: remoteTitle });
    if (!titleDirty) updateTitle(remoteTitle);
    if (text !== local) updateContent(text, range);
    if (conflict) toast.info(`Your edit overlapped with ${byName ?? "a collaborator"}'s change — your version was kept.`);

    if (text !== remoteContent || titleRef.current !== remoteTitle) {
      setSaveState("dirty");
      scheduleFlush(100);
    } else {
      setSaveState("saved");
    }
  }

  function adoptServerState(d: Document) {
    window.clearTimeout(debounceTimer.current);
    window.clearTimeout(inFlightTimer.current);
    inFlightRef.current = false;
    setBase({ revision: d.revision, content: d.content, title: d.title });
    updateContent(d.content);
    updateTitle(d.title);
    setStatus(d.status);
    setDocType(d.doc_type);
    setSaveState("saved");
  }

  // ------------------------------------------------------------------ socket events

  const { status: socketStatus, sendOperation, sendCursor } = useDocumentSocket(documentId, {
    onOperation: (msg: OperationMessage) => {
      const base = baseRef.current;
      if (msg.revision <= base.revision) return; // duplicate or already merged
      if (msg.origin === clientId) {
        setBase({ revision: msg.revision, content: msg.content, title: msg.title ?? base.title });
        afterResolved();
      } else {
        applyRemote(msg.revision, msg.content, msg.title ?? base.title, msg.editedByName);
      }
    },
    onAck: () => afterResolved(),
    onStale: (msg: StaleMessage) => {
      if (msg.currentRevision > baseRef.current.revision) applyRemote(msg.currentRevision, msg.currentContent, msg.currentTitle);
      afterResolved();
    },
    onPresence: (users: PresenceUser[]) => {
      setPresence(users);
      const present = new Set(users.map((u) => u.user_id));
      setCursors((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => present.has(id))));
    },
    onCursor: (cursor: CursorInfo) => setCursors((prev) => ({ ...prev, [cursor.user_id]: cursor })),
    onMeta: (msg: MetaMessage) => {
      const changed = msg.status !== status;
      setStatus(msg.status);
      setDocType(msg.docType);
      if (changed && Date.now() > ignoreMetaUntil.current) {
        toast.info(`${msg.changedByName} moved this document to ${statusMeta(msg.status).label}`);
      }
    },
    onCommentEvent: () => {
      loadComments();
      if (panel !== "comments") setUnreadComments(true);
    },
    onServerError: (msg: ServerErrorMessage) => {
      inFlightRef.current = false;
      window.clearTimeout(inFlightTimer.current);
      const detail = msg.message as { error?: string; message?: string } | string;
      if (typeof detail === "object" && detail?.error === "DOCUMENT_ARCHIVED") {
        setStatus("archived");
        toast.error(detail.message ?? "This document is archived.");
      } else if (msg.code === 403) {
        toast.error("You no longer have permission to edit this document.");
        getDocument(documentId).then((d) => setRole(d.my_role)).catch(() => undefined);
      } else {
        toast.error(typeof detail === "string" ? detail : "Couldn't save your changes.");
      }
      setSaveState("dirty");
    },
    onReconnect: async () => {
      inFlightRef.current = false;
      try {
        const d = await getDocument(documentId);
        setRole(d.my_role);
        setStatus(d.status);
        setDocType(d.doc_type);
        if (d.revision > baseRef.current.revision) applyRemote(d.revision, d.content, d.title);
        scheduleFlush(0);
        loadComments();
      } catch {
        /* the next reconnect will retry */
      }
    },
  });

  // ------------------------------------------------------------------ loading

  const loadComments = useCallback(async () => {
    try {
      setComments(await listComments(documentId));
    } catch {
      /* non-fatal */
    } finally {
      setCommentsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setLoadError(null);
    setCommentsLoading(true);
    getDocument(documentId)
      .then((d) => {
        if (cancelled) return;
        baseRef.current = { revision: d.revision, content: d.content, title: d.title };
        contentRef.current = d.content;
        titleRef.current = d.title;
        setDoc(d);
        setRevision(d.revision);
        setTitle(d.title);
        setContent(d.content);
        setStatus(d.status);
        setDocType(d.doc_type);
        setRole(d.my_role);
        setActiveId(d.workspace_id);
        loadComments();
        listMembers(d.workspace_id).then((m) => !cancelled && setMembers(m)).catch(() => undefined);
      })
      .catch((err) => !cancelled && setLoadError({ status: err instanceof ApiError ? err.status : 0, message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [documentId, loadComments, setActiveId]);

  // Safety nets: don't lose unsent edits when leaving the page.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const b = baseRef.current;
      if (contentRef.current !== b.content || titleRef.current !== b.title) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.clearTimeout(debounceTimer.current);
      window.clearTimeout(inFlightTimer.current);
      const b = baseRef.current;
      if (canEditRef.current && (contentRef.current !== b.content || titleRef.current !== b.title)) {
        updateDocument(documentId, b.revision, { content: contentRef.current, title: titleRef.current }).catch(() => undefined);
      }
    };
  }, [documentId]);

  // ------------------------------------------------------------------ user actions

  function handleContentChange(value: string) {
    if (!canEdit) return;
    updateContent(value);
    setSaveState("dirty");
    scheduleFlush(DEBOUNCE_MS);
  }

  function handleTitleChange(value: string) {
    if (!canEdit) return;
    updateTitle(value);
    setSaveState("dirty");
  }

  async function handleStatusChange(next: DocumentStatus) {
    const prev = status;
    ignoreMetaUntil.current = Date.now() + 2500;
    setStatus(next);
    try {
      await updateDocumentMeta(documentId, { status: next });
      toast.success(`Moved to ${statusMeta(next).label}`);
    } catch (err) {
      setStatus(prev);
      toast.error(errorMessage(err));
    }
  }

  async function handleTypeChange(next: DocumentType) {
    const prev = docType;
    ignoreMetaUntil.current = Date.now() + 2500;
    setDocType(next);
    try {
      await updateDocumentMeta(documentId, { doc_type: next });
      toast.success(`Changed type to ${typeMeta(next).label}`);
    } catch (err) {
      setDocType(prev);
      toast.error(errorMessage(err));
    }
  }

  // Comments anchored to text ------------------------------------------------

  const { segments, anchors, orphanedIds } = useMemo(() => {
    const list: AnchoredRange[] = [];
    const orphaned = new Set<string>();
    for (const c of comments) {
      if (c.range_start == null) continue;
      const range = resolveAnchor(content, c);
      if (!range) {
        if (!c.resolved) orphaned.add(c.id);
        continue;
      }
      if (!c.resolved || c.id === activeCommentId) list.push({ id: c.id, start: range.start, end: range.end, resolved: c.resolved });
    }
    return { anchors: list, orphanedIds: orphaned, segments: buildSegments(content, list) };
  }, [comments, content, activeCommentId]);

  function handleSelect() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;

    if (!cursorTimer.current) {
      cursorTimer.current = window.setTimeout(() => (cursorTimer.current = null), CURSOR_THROTTLE_MS);
      sendCursor(end, start, end);
    }

    setSelection(start !== end ? { start, end } : null);
    if (start === end) {
      const hit = anchors.find((a) => start >= a.start && start <= a.end);
      setActiveCommentId(hit?.id ?? null);
      if (hit) {
        setPanel("comments");
        setUnreadComments(false);
      }
    }
  }

  function startComment() {
    if (!selection) return;
    const quote = content.slice(selection.start, selection.end).slice(0, 2000);
    setPendingAnchor({ start: selection.start, end: selection.end, quote });
    setPanel("comments");
    setUnreadComments(false);
    setSelection(null);
  }

  function jumpToComment(comment: Comment) {
    setActiveCommentId(comment.id);
    const range = resolveAnchor(content, comment);
    const ta = textareaRef.current;
    const scroller = scrollRef.current;
    if (!range || !ta || !scroller) return;
    const coords = getCaretCoordinates(ta, range.start);
    const y = ta.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + coords.top - 140;
    scroller.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  function togglePanel(next: Exclude<Panel, null>) {
    setPanel((prev) => (prev === next ? null : next));
    if (next === "comments") setUnreadComments(false);
  }

  // ------------------------------------------------------------------ render

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50">
        <EmptyState
          icon={<Lock size={20} />}
          title={loadError.status === 404 ? "Document not found" : "Can't open this document"}
          description={loadError.status === 404 ? "It may have been deleted, or you don't have access to its workspace." : loadError.message}
          action={<Link to="/" className="btn-secondary"><ArrowLeft size={15} /> Back to workspaces</Link>}
        />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-full flex-col bg-zinc-100/60">
        <div className="flex h-14 items-center gap-3 border-b border-zinc-200 bg-white px-4">
          <Skeleton className="h-8 w-8" /><Skeleton className="h-5 w-64" />
        </div>
        <div className="mx-auto mt-8 w-full max-w-3xl space-y-3 rounded-xl border border-zinc-200 bg-white p-12">
          <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  const openComments = comments.filter((c) => !c.resolved).length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const canChangeStatus = role === "owner" || role === "editor";

  let floatingStyle: React.CSSProperties | null = null;
  if (canComment && selection && textareaRef.current) {
    const ta = textareaRef.current;
    const c = getCaretCoordinates(ta, selection.end);
    floatingStyle = { top: c.top + c.height + 8, left: Math.min(Math.max(c.left - 40, 8), Math.max(8, ta.clientWidth - 130)) };
  }

  const saveIndicator =
    !canEdit ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        {isArchived ? <Lock size={13} /> : <Eye size={13} />} {isArchived ? "Archived" : "View only"}
      </span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><Check size={13} /> Saved</span>
    ) : saveState === "offline" ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600"><CloudOff size={13} /> Offline — will sync</span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><Spinner size={12} /> Saving…</span>
    );

  return (
    <div className="flex h-full flex-col bg-zinc-100/60">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 sm:gap-3 sm:px-4">
        <Link to={`/w/${doc.workspace_id}`} className="btn-icon" aria-label="Back to workspace" title={workspace?.name ?? "Back"}>
          <ArrowLeft size={17} />
        </Link>
        <TypeMenu type={docType} canChange={canChangeStatus && !isArchived} onChange={handleTypeChange} />
        <input
          value={title}
          readOnly={!canEdit}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={() => flush()}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          maxLength={500}
          aria-label="Document title"
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold text-zinc-900 hover:bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 read-only:hover:bg-transparent"
        />
        <span className="hidden sm:block">{saveIndicator}</span>
        <StatusMenu status={status} role={role} onChange={handleStatusChange} />
        <div className="hidden md:block"><PresenceBar users={presence} currentUserId={user?.id} status={socketStatus} /></div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => togglePanel("comments")}
            className={cx("btn-ghost relative", panel === "comments" && "bg-zinc-100 text-zinc-900")}
            aria-pressed={panel === "comments"}
            title="Comments"
          >
            <MessageSquare size={16} />
            <span className="hidden lg:inline">Comments</span>
            {openComments > 0 && <span className="rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold text-zinc-700">{openComments}</span>}
            {unreadComments && panel !== "comments" && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />}
          </button>
          <button
            onClick={() => togglePanel("history")}
            className={cx("btn-ghost", panel === "history" && "bg-zinc-100 text-zinc-900")}
            aria-pressed={panel === "history"}
            title="Version history"
          >
            <HistoryIcon size={16} /> <span className="hidden lg:inline">History</span>
          </button>
          {workspace && (
            <button onClick={() => setMembersOpen(true)} className="btn-primary ml-1" title="Share">
              <Share2 size={15} /> <span className="hidden sm:inline">Share</span>
            </button>
          )}
        </div>
      </header>

      {isArchived && (
        <div className="flex items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <Lock size={14} /> This document is archived and read-only.
          {canChangeStatus && (
            <button onClick={() => handleStatusChange("draft")} className="font-medium underline underline-offset-2 hover:text-amber-700">
              Move back to Draft
            </button>
          )}
        </div>
      )}
      {!isArchived && !canEdit && role && (
        <div className="flex items-center justify-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
          <Eye size={14} /> You have <b className="font-semibold">{role}</b> access — {role === "commenter" ? "you can read and comment" : "you can read this document"}.
        </div>
      )}
      {socketStatus === "denied" && (
        <div className="flex items-center justify-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <AlertTriangle size={14} /> Live updates are unavailable — you may have lost access. Your changes won't sync.
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto my-6 w-full max-w-3xl px-3 sm:px-6">
            <div className="relative rounded-xl border border-zinc-200 bg-white shadow-card">
              <HighlightedEditor
                value={content}
                onChange={handleContentChange}
                readOnly={!canEdit}
                segments={segments}
                activeCommentId={activeCommentId}
                textareaRef={textareaRef}
                onSelect={handleSelect}
              >
                <CursorOverlay textareaRef={textareaRef} cursors={cursors} currentUserId={user?.id} content={content} />
                {floatingStyle && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={startComment}
                    style={floatingStyle}
                    className="absolute z-[3] inline-flex animate-scale-in items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-pop hover:bg-zinc-800"
                  >
                    <MessageSquarePlus size={14} /> Comment
                  </button>
                )}
              </HighlightedEditor>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">
              {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"} · Revision {revision}
            </p>
          </div>
        </div>

        {panel && (
          <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm animate-slide-in flex-col border-l border-zinc-200 bg-white shadow-pop md:static md:w-[22rem] md:max-w-none md:shadow-none">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-100 pl-4 pr-2">
              <h2 className="text-sm font-semibold text-zinc-900">{panel === "comments" ? "Comments" : "Version history"}</h2>
              <button className="btn-icon h-7 w-7" onClick={() => setPanel(null)} aria-label="Close panel"><X size={15} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === "comments" ? (
                <CommentsPanel
                  documentId={documentId}
                  comments={comments}
                  loading={commentsLoading}
                  members={members}
                  currentUserId={user?.id ?? ""}
                  role={role}
                  pendingAnchor={pendingAnchor}
                  onClearAnchor={() => setPendingAnchor(null)}
                  activeCommentId={activeCommentId}
                  orphanedIds={orphanedIds}
                  onActivate={jumpToComment}
                  onChanged={loadComments}
                />
              ) : (
                <VersionHistory documentId={documentId} currentRevision={revision} canRestore={canEdit} onRestored={adoptServerState} />
              )}
            </div>
          </aside>
        )}
      </div>

      {workspace && <MembersModal open={membersOpen} onClose={() => setMembersOpen(false)} workspace={workspace} />}
    </div>
  );
}
