import { Check, MessageSquare, Quote, RotateCcw, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { type Comment, createComment, reopenComment, replyToComment, resolveComment } from "../../api/documents";
import type { Member, WorkspaceRole } from "../../api/workspaces";
import { useToast } from "../../context/ToastContext";
import { relativeTime } from "../../utils/time";
import { Avatar, EmptyState, Spinner, cx } from "../ui";
import MentionInput, { MentionText } from "./MentionInput";

export interface PendingAnchor {
  start: number;
  end: number;
  quote: string;
}

interface Props {
  documentId: string;
  comments: Comment[];
  loading: boolean;
  members: Member[];
  currentUserId: string;
  role: WorkspaceRole | null;
  pendingAnchor: PendingAnchor | null;
  onClearAnchor: () => void;
  activeCommentId: string | null;
  orphanedIds: Set<string>;
  onActivate: (comment: Comment) => void;
  onChanged: () => Promise<void> | void;
}

function Thread({
  comment,
  members,
  canResolve,
  canReply,
  active,
  orphaned,
  onActivate,
  onChanged,
}: {
  comment: Comment;
  members: Member[];
  canResolve: boolean;
  canReply: boolean;
  active: boolean;
  orphaned: boolean;
  onActivate: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  async function toggleResolved() {
    setBusy(true);
    try {
      await (comment.resolved ? reopenComment(comment.id) : resolveComment(comment.id));
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await replyToComment(comment.id, draft.trim());
      setDraft("");
      setReplying(false);
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={ref}
      className={cx(
        "rounded-xl border bg-white p-3.5 transition-shadow",
        active ? "border-amber-300 shadow-card ring-1 ring-amber-200" : "border-zinc-200",
        comment.resolved && "opacity-75"
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.author_name} id={comment.author_id} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-900">{comment.author_name}</span>
            <span className="text-xs text-zinc-400" title={new Date(comment.created_at).toLocaleString()}>{relativeTime(comment.created_at)}</span>
          </div>
        </div>
        {canResolve && (
          <button
            onClick={toggleResolved}
            disabled={busy}
            className="btn-icon h-7 w-7"
            title={comment.resolved ? "Reopen" : "Resolve"}
            aria-label={comment.resolved ? "Reopen comment" : "Resolve comment"}
          >
            {busy ? <Spinner size={14} /> : comment.resolved ? <RotateCcw size={14} /> : <Check size={15} />}
          </button>
        )}
      </div>

      {comment.quote && (
        <button
          onClick={onActivate}
          className="mt-2.5 flex w-full items-start gap-2 rounded-lg border-l-2 border-amber-300 bg-amber-50/60 px-2.5 py-1.5 text-left hover:bg-amber-50"
          title={orphaned ? "The commented text was edited or removed" : "Jump to text"}
        >
          <Quote size={12} className="mt-0.5 shrink-0 text-amber-500" />
          <span className="line-clamp-2 text-xs italic text-zinc-600">{comment.quote}</span>
        </button>
      )}
      {orphaned && <p className="mt-1 text-[11px] text-zinc-400">The commented text was changed or deleted.</p>}

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">
        <MentionText text={comment.content} members={members} />
      </p>

      {comment.replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l-2 border-zinc-100 pl-3">
          {comment.replies.map((r) => (
            <li key={r.id} className="flex gap-2">
              <Avatar name={r.author_name} id={r.author_id} size="xs" className="mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs">
                  <span className="font-semibold text-zinc-900">{r.author_name}</span>{" "}
                  <span className="text-zinc-400">{relativeTime(r.created_at)}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-zinc-700">
                  <MentionText text={r.content} members={members} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canReply &&
        (replying ? (
          <div className="mt-3 space-y-2">
            <MentionInput
              value={draft}
              onChange={setDraft}
              members={members}
              autoFocus
              rows={2}
              placeholder="Write a reply… use @ to mention"
              ariaLabel="Reply"
              onSubmit={sendReply}
            />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost h-7 px-2 text-xs" onClick={() => { setReplying(false); setDraft(""); }}>Cancel</button>
              <button className="btn-primary h-7 px-2.5 text-xs" onClick={sendReply} disabled={busy || !draft.trim()}>Reply</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReplying(true)} className="mt-2.5 text-xs font-medium text-zinc-500 hover:text-brand-600">
            Reply
          </button>
        ))}
    </div>
  );
}

export default function CommentsPanel({
  documentId,
  comments,
  loading,
  members,
  currentUserId,
  role,
  pendingAnchor,
  onClearAnchor,
  activeCommentId,
  orphanedIds,
  onActivate,
  onChanged,
}: Props) {
  const toast = useToast();
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const canComment = role !== null && role !== "viewer";
  const canResolveAny = role === "owner" || role === "editor";

  const { open, resolved } = useMemo(
    () => ({ open: comments.filter((c) => !c.resolved), resolved: comments.filter((c) => c.resolved) }),
    [comments]
  );
  const visible = filter === "open" ? open : resolved;

  useEffect(() => {
    if (pendingAnchor) {
      setFilter("open");
      composerRef.current?.focus();
    }
  }, [pendingAnchor]);

  async function post() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await createComment(documentId, {
        content: draft.trim(),
        ...(pendingAnchor ? { range_start: pendingAnchor.start, range_end: pendingAnchor.end, quote: pendingAnchor.quote } : {}),
      });
      setDraft("");
      onClearAnchor();
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-zinc-100 px-4 py-2.5">
        {(["open", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cx(
              "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
              filter === f ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
            )}
          >
            {f} <span className={filter === f ? "text-zinc-300" : "text-zinc-400"}>{f === "open" ? open.length : resolved.length}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading && comments.length === 0 ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={18} />}
            title={filter === "open" ? "No open comments" : "Nothing resolved yet"}
            description={filter === "open" && canComment ? "Select text in the document and click Comment, or write a general comment below." : undefined}
          />
        ) : (
          visible.map((c) => (
            <Thread
              key={c.id}
              comment={c}
              members={members}
              canResolve={canResolveAny || (canComment && c.author_id === currentUserId)}
              canReply={canComment}
              active={c.id === activeCommentId}
              orphaned={orphanedIds.has(c.id)}
              onActivate={() => onActivate(c)}
              onChanged={onChanged}
            />
          ))
        )}
      </div>

      <div className="border-t border-zinc-100 p-3">
        {canComment ? (
          <div className="space-y-2">
            {pendingAnchor && (
              <div className="flex items-start gap-2 rounded-lg border-l-2 border-amber-300 bg-amber-50/70 px-2.5 py-1.5">
                <Quote size={12} className="mt-0.5 shrink-0 text-amber-500" />
                <span className="line-clamp-2 flex-1 text-xs italic text-zinc-600">{pendingAnchor.quote}</span>
                <button onClick={onClearAnchor} className="text-zinc-400 hover:text-zinc-700" aria-label="Remove text reference">
                  <X size={13} />
                </button>
              </div>
            )}
            <MentionInput
              value={draft}
              onChange={setDraft}
              members={members}
              rows={3}
              placeholder={pendingAnchor ? "Comment on the selected text…" : "Add a comment… use @ to mention"}
              ariaLabel="New comment"
              onSubmit={post}
              inputRef={composerRef}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">⌘/Ctrl + Enter to post</span>
              <button className="btn-primary" onClick={post} disabled={posting || !draft.trim()}>
                {posting && <Spinner size={14} className="text-white/80" />} Comment
              </button>
            </div>
          </div>
        ) : (
          <p className="px-1 py-1.5 text-center text-xs text-zinc-500">Viewers can read comments but can't add them.</p>
        )}
      </div>
    </div>
  );
}
