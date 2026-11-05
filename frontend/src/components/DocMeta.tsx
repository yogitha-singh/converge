import { Check, ChevronDown, FileCode2, FileText, ListChecks, NotebookPen, type LucideIcon } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import type { DocumentStatus, DocumentType } from "../api/documents";
import type { WorkspaceRole } from "../api/workspaces";
import { cx, useClickOutside } from "./ui";

export const DOC_TYPES: { value: DocumentType; label: string; description: string; icon: LucideIcon; tint: string }[] = [
  { value: "spec", label: "Spec", description: "Requirements and design details", icon: FileText, tint: "bg-indigo-50 text-indigo-600" },
  { value: "rfc", label: "RFC", description: "Proposal that invites review", icon: FileCode2, tint: "bg-violet-50 text-violet-600" },
  { value: "meeting_notes", label: "Meeting Notes", description: "Agenda, notes and action items", icon: NotebookPen, tint: "bg-emerald-50 text-emerald-600" },
  { value: "sprint_plan", label: "Sprint Plan", description: "Scope and goals for an iteration", icon: ListChecks, tint: "bg-amber-50 text-amber-600" },
];

export const STATUSES: { value: DocumentStatus; label: string; dot: string; badge: string }[] = [
  { value: "draft", label: "Draft", dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  { value: "in_review", label: "In Review", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "approved", label: "Approved", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "archived", label: "Archived", dot: "bg-zinc-300", badge: "bg-zinc-50 text-zinc-500 ring-zinc-200" },
];

/** Mirror of ALLOWED_TRANSITIONS in backend/app/services/document_service.py (the backend enforces it). */
export const ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "approved", "archived"],
  approved: ["in_review", "archived"],
  archived: ["draft"],
};

export const typeMeta = (type: DocumentType) => DOC_TYPES.find((t) => t.value === type) ?? DOC_TYPES[0];
export const statusMeta = (status: DocumentStatus) => STATUSES.find((s) => s.value === status) ?? STATUSES[0];

/** Can this role move a document from `from` to `to`? Returns a reason string when it cannot. */
export function transitionBlockedReason(from: DocumentStatus, to: DocumentStatus, role: WorkspaceRole | null): string | null {
  if (from === to) return null;
  if (role !== "owner" && role !== "editor") return "You don't have permission to change the status";
  if (!ALLOWED_TRANSITIONS[from].includes(to)) return `Can't go from ${statusMeta(from).label} to ${statusMeta(to).label}`;
  if ((from === "approved" || to === "approved") && role !== "owner") return "Only an owner can approve or change an approved document";
  return null;
}

export function DocTypeIcon({ type, size = 16, boxed = false, className }: { type: DocumentType; size?: number; boxed?: boolean; className?: string }) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  if (!boxed) return <Icon size={size} className={cx("shrink-0", meta.tint.split(" ")[1], className)} aria-label={meta.label} />;
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-lg", meta.tint, className)} style={{ width: size * 1.9, height: size * 1.9 }} title={meta.label}>
      <Icon size={size} />
    </span>
  );
}

export function StatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  const meta = statusMeta(status);
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", meta.badge, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function StatusMenu({
  status,
  role,
  onChange,
}: {
  status: DocumentStatus;
  role: WorkspaceRole | null;
  onChange: (next: DocumentStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const canChangeAny = role === "owner" || role === "editor";
  if (!canChangeAny) return <StatusBadge status={status} />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change status"
      >
        <StatusBadge status={status} className="transition-shadow group-hover:shadow-card" />
        <ChevronDown size={14} className="text-zinc-400 group-hover:text-zinc-600" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-60 animate-scale-in rounded-xl border border-zinc-200 bg-white p-1 shadow-pop" role="listbox">
          <p className="section-title px-2.5 pb-1 pt-2">Move to</p>
          {STATUSES.map((s) => {
            const blocked = transitionBlockedReason(status, s.value, role);
            const current = s.value === status;
            return (
              <button
                key={s.value}
                role="option"
                aria-selected={current}
                disabled={!!blocked && !current}
                title={blocked ?? undefined}
                onClick={() => {
                  setOpen(false);
                  if (!current) onChange(s.value);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className={cx("h-2 w-2 rounded-full", s.dot)} />
                <span className="flex-1">{s.label}</span>
                {current && <Check size={14} className="text-brand-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TypePicker({ value, onChange }: { value: DocumentType; onChange: (t: DocumentType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Document type">
      {DOC_TYPES.map((t) => {
        const selected = t.value === value;
        const Icon = t.icon;
        return (
          <button
            type="button"
            key={t.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.value)}
            className={cx(
              "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
              selected ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
            )}
          >
            <span className={cx("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.tint)}>
              <Icon size={15} />
            </span>
            <span>
              <span className="block text-sm font-medium text-zinc-900">{t.label}</span>
              <span className="block text-xs leading-snug text-zinc-500">{t.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TypeMenu({
  type,
  canChange,
  onChange,
}: {
  type: DocumentType;
  canChange: boolean;
  onChange: (next: DocumentType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  if (!canChange) return <DocTypeIcon type={type} size={16} boxed />;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${typeMeta(type).label} — change type`}
      >
        <DocTypeIcon type={type} size={16} boxed className="transition-opacity hover:opacity-80" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-60 animate-scale-in rounded-xl border border-zinc-200 bg-white p-1 shadow-pop" role="listbox">
          <p className="section-title px-2.5 pb-1 pt-2">Document type</p>
          {DOC_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                role="option"
                aria-selected={t.value === type}
                onClick={() => {
                  setOpen(false);
                  if (t.value !== type) onChange(t.value);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <span className={cx("inline-flex h-6 w-6 items-center justify-center rounded-md", t.tint)}><Icon size={13} /></span>
                <span className="flex-1">{t.label}</span>
                {t.value === type && <Check size={14} className="text-brand-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
