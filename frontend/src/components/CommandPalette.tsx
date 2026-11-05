import { CornerDownLeft, FilePlus2, History, LogOut, Search, Users, ArrowRightLeft } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchDocuments, type SearchResult } from "../api/search";
import { useAuth } from "../context/AuthContext";
import { usePalette } from "../context/PaletteContext";
import { useWorkspaces } from "../context/WorkspaceContext";
import { DocTypeIcon, statusMeta } from "./DocMeta";
import { Kbd, Spinner, cx } from "./ui";

interface PaletteItem {
  id: string;
  section: "Actions" | "Workspaces" | "Documents";
  label: string;
  secondary?: string;
  icon: React.ReactNode;
  run: () => void;
}

export default function CommandPalette() {
  const { open, closePalette, togglePalette } = usePalette();
  const { workspaces, active, setActiveId } = useWorkspaces();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  // Global hotkey: Cmd+K on macOS, Ctrl+K elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced document search; ignore responses that arrive out of order.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchDocuments(q);
        if (id === requestId.current) setResults(found);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (fn: () => void) => () => {
      closePalette();
      fn();
    },
    [closePalette]
  );

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const canEdit = active?.my_role === "owner" || active?.my_role === "editor";
    const list: PaletteItem[] = [];

    const actions: PaletteItem[] = [];
    if (active && canEdit) {
      actions.push({
        id: "new-doc", section: "Actions", label: "Create new document", secondary: active.name,
        icon: <FilePlus2 size={16} />, run: go(() => navigate(`/w/${active.id}?new=1`)),
      });
    }
    if (active) {
      actions.push(
        {
          id: "activity", section: "Actions", label: "View activity log", secondary: active.name,
          icon: <History size={16} />, run: go(() => navigate(`/w/${active.id}?tab=activity`)),
        },
        {
          id: "members", section: "Actions", label: "Manage members", secondary: active.name,
          icon: <Users size={16} />, run: go(() => navigate(`/w/${active.id}?members=1`)),
        }
      );
    }
    actions.push({ id: "logout", section: "Actions", label: "Sign out", icon: <LogOut size={16} />, run: go(logout) });
    list.push(...actions.filter((a) => matches(a.label)));

    list.push(
      ...workspaces
        .filter((w) => matches(w.name))
        .map<PaletteItem>((w) => ({
          id: `ws-${w.id}`, section: "Workspaces", label: w.name,
          secondary: w.id === active?.id ? "Current workspace" : "Switch workspace",
          icon: <ArrowRightLeft size={16} />,
          run: go(() => {
            setActiveId(w.id);
            navigate(`/w/${w.id}`);
          }),
        }))
    );

    list.push(
      ...results.map<PaletteItem>((r) => ({
        id: `doc-${r.id}`, section: "Documents", label: r.title,
        secondary: `${r.workspace_name} · ${statusMeta(r.status).label}${r.snippet ? ` · ${r.snippet}` : ""}`,
        icon: <DocTypeIcon type={r.doc_type} size={15} boxed />,
        run: go(() => navigate(`/documents/${r.id}`)),
      }))
    );
    return list;
  }, [query, results, workspaces, active, go, navigate, logout, setActiveId]);

  useEffect(() => setSelected(0), [items.length, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (items.length ? (s + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[selected]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  };

  const sections = (["Actions", "Documents", "Workspaces"] as const).map((name) => ({
    name,
    entries: items.map((item, index) => ({ item, index })).filter((x) => x.item.section === name),
  }));

  const q = query.trim();
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="fixed inset-0 animate-fade-in bg-zinc-900/40 backdrop-blur-[2px]" onClick={closePalette} aria-hidden />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-pop">
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4">
          <Search size={17} className="shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search documents, switch workspace, run a command…"
            className="h-12 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {searching ? <Spinner size={15} /> : <Kbd>Esc</Kbd>}
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {sections.map(
            (section) =>
              section.entries.length > 0 && (
                <div key={section.name} className="mb-1">
                  <p className="section-title px-2.5 pb-1 pt-2">{section.name}</p>
                  {section.entries.map(({ item, index }) => (
                    <button
                      key={item.id}
                      data-index={index}
                      onMouseMove={() => setSelected(index)}
                      onClick={item.run}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                        index === selected ? "bg-brand-50" : "hover:bg-zinc-50"
                      )}
                    >
                      <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center", index === selected ? "text-brand-600" : "text-zinc-500")}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900">{item.label}</span>
                        {item.secondary && <span className="block truncate text-xs text-zinc-500">{item.secondary}</span>}
                      </span>
                      {index === selected && <CornerDownLeft size={14} className="shrink-0 text-brand-500" />}
                    </button>
                  ))}
                </div>
              )
          )}
          {items.length === 0 && !searching && (
            <p className="px-3 py-10 text-center text-sm text-zinc-500">
              {q.length < 2 ? "Keep typing to search your documents…" : `No results for “${q}”`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-zinc-100 bg-zinc-50/70 px-4 py-2 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
          <span className="ml-auto">Search covers titles and content</span>
        </div>
      </div>
    </div>
  );
}
