import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Workspace, listWorkspaces } from "../api/workspaces";

const ACTIVE_KEY = "converge_active_workspace";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  loading: boolean;
  active: Workspace | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
  refresh: () => Promise<Workspace[]>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveIdState] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));

  const setActiveId = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveIdState(id);
  }, []);

  const refresh = useCallback(async () => {
    const list = await listWorkspaces();
    setWorkspaces(list);
    setLoading(false);
    return list;
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null,
    [workspaces, activeId]
  );

  const value = useMemo(
    () => ({ workspaces, loading, active, activeId: active?.id ?? null, setActiveId, refresh }),
    [workspaces, loading, active, setActiveId, refresh]
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaces must be used within a WorkspaceProvider");
  return ctx;
}
