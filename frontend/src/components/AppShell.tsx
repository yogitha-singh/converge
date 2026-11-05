import { LogOut, Menu, Plus, Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePalette } from "../context/PaletteContext";
import { useWorkspaces } from "../context/WorkspaceContext";
import CreateWorkspaceModal from "./CreateWorkspaceModal";
import { Logo } from "./Logo";
import NotificationsBell from "./NotificationsBell";
import { Avatar, Kbd, Skeleton, cx } from "./ui";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_KEY = isMac ? "⌘" : "Ctrl";

function Sidebar({ onNavigate, onCreate }: { onNavigate?: () => void; onCreate: () => void }) {
  const { user, logout } = useAuth();
  const { workspaces, loading, setActiveId } = useWorkspaces();
  const { openPalette } = usePalette();

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Logo />
      </div>

      <div className="px-3">
        <button
          onClick={() => {
            onNavigate?.();
            openPalette();
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-white"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search…</span>
          <span className="flex gap-0.5"><Kbd>{MOD_KEY}</Kbd><Kbd>K</Kbd></span>
        </button>
      </div>

      <nav className="mt-5 min-h-0 flex-1 overflow-y-auto px-3" aria-label="Workspaces">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <span className="section-title">Workspaces</span>
          <button onClick={onCreate} className="btn-icon h-6 w-6" aria-label="New workspace" title="New workspace">
            <Plus size={14} />
          </button>
        </div>
        {loading && (
          <div className="space-y-1.5 px-1">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        )}
        <ul className="space-y-0.5">
          {workspaces.map((w) => (
            <li key={w.id}>
              <NavLink
                to={`/w/${w.id}`}
                onClick={() => {
                  setActiveId(w.id);
                  onNavigate?.();
                }}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    isActive ? "bg-brand-50 font-medium text-brand-700" : "text-zinc-700 hover:bg-zinc-100"
                  )
                }
              >
                <Avatar name={w.name} id={w.id} size="sm" className="rounded-md" />
                <span className="truncate">{w.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {!loading && workspaces.length === 0 && (
          <p className="px-2 py-3 text-xs text-zinc-500">No workspaces yet.</p>
        )}
      </nav>

      <div className="shrink-0 border-t border-zinc-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
          <Avatar name={user?.name ?? "?"} id={user?.id} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{user?.name}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
          <button onClick={logout} className="btn-icon" aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { openPalette } = usePalette();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="flex h-full bg-zinc-50">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 md:block">
        <Sidebar onCreate={() => setCreating(true)} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-zinc-900/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in shadow-pop">
            <Sidebar onNavigate={() => setMenuOpen(false)} onCreate={() => { setMenuOpen(false); setCreating(true); }} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur md:px-6">
          <button className="btn-icon md:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <button onClick={openPalette} className="btn-ghost hidden gap-2 text-zinc-500 sm:inline-flex" aria-label="Open command palette">
            <Search size={15} /> Search <span className="flex gap-0.5"><Kbd>{MOD_KEY}</Kbd><Kbd>K</Kbd></span>
          </button>
          <button onClick={openPalette} className="btn-icon sm:hidden" aria-label="Search"><Search size={17} /></button>
          <NotificationsBell />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CreateWorkspaceModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
