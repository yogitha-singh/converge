import { apiFetch } from "./client";

export type WorkspaceRole = "owner" | "editor" | "commenter" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  my_role: WorkspaceRole | null;
}

export interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: WorkspaceRole;
}

export interface ActivityEntry {
  id: string;
  action: string;
  description: string;
  actor_id: string;
  actor_name: string;
  document_id: string | null;
  created_at: string;
}

export const listWorkspaces = () => apiFetch<Workspace[]>("/api/workspaces");
export const createWorkspace = (name: string) =>
  apiFetch<Workspace>("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) });
export const getWorkspace = (id: string) => apiFetch<Workspace>(`/api/workspaces/${id}`);
export const renameWorkspace = (id: string, name: string) =>
  apiFetch<Workspace>(`/api/workspaces/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
export const deleteWorkspace = (id: string) => apiFetch<null>(`/api/workspaces/${id}`, { method: "DELETE" });

export const listMembers = (workspaceId: string) => apiFetch<Member[]>(`/api/workspaces/${workspaceId}/members`);
export const inviteMember = (workspaceId: string, email: string, role: WorkspaceRole) =>
  apiFetch<Member>(`/api/workspaces/${workspaceId}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
export const updateMemberRole = (workspaceId: string, userId: string, role: WorkspaceRole) =>
  apiFetch<Member>(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
export const removeMember = (workspaceId: string, userId: string) =>
  apiFetch<null>(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });

export const listActivity = (workspaceId: string, limit = 50, offset = 0) =>
  apiFetch<ActivityEntry[]>(`/api/workspaces/${workspaceId}/activity?limit=${limit}&offset=${offset}`);
