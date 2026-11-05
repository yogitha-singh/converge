import { apiFetch } from "./client";
import type { WorkspaceRole } from "./workspaces";

export type DocumentStatus = "draft" | "in_review" | "approved" | "archived";
export type DocumentType = "spec" | "rfc" | "meeting_notes" | "sprint_plan";

export interface Document {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  status: DocumentStatus;
  doc_type: DocumentType;
  revision: number;
  created_by: string;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
  my_role: WorkspaceRole | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  doc_type: DocumentType;
  revision: number;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  revision: number;
  title: string;
  edited_by: string;
  edited_by_name: string;
  created_at: string;
}

export interface DocumentVersionDetail extends DocumentVersion {
  content: string;
}

export interface CommentReply {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface Comment {
  id: string;
  document_id: string;
  author_id: string;
  author_name: string;
  content: string;
  range_start: number | null;
  range_end: number | null;
  quote: string | null;
  resolved: boolean;
  created_at: string;
  replies: CommentReply[];
}

export interface ListDocumentsOptions {
  search?: string;
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
}

export function listDocuments(workspaceId: string, opts: ListDocumentsOptions = {}) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (opts.search) params.set("search", opts.search);
  if (opts.status) params.set("status", opts.status);
  params.set("limit", String(opts.limit ?? 50));
  params.set("offset", String(opts.offset ?? 0));
  return apiFetch<DocumentSummary[]>(`/api/documents?${params}`);
}

export const createDocument = (workspaceId: string, title: string, docType: DocumentType = "spec", content = "") =>
  apiFetch<Document>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId, title, doc_type: docType, content }),
  });

export const getDocument = (id: string) => apiFetch<Document>(`/api/documents/${id}`);

export const updateDocumentMeta = (id: string, patch: { status?: DocumentStatus; doc_type?: DocumentType }) =>
  apiFetch<Document>(`/api/documents/${id}/meta`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteDocument = (id: string) => apiFetch<null>(`/api/documents/${id}`, { method: "DELETE" });

export const listVersions = (documentId: string) => apiFetch<DocumentVersion[]>(`/api/documents/${documentId}/versions`);
export const getVersion = (documentId: string, versionId: string) =>
  apiFetch<DocumentVersionDetail>(`/api/documents/${documentId}/versions/${versionId}`);
export const restoreVersion = (documentId: string, versionId: string) =>
  apiFetch<Document>(`/api/documents/${documentId}/restore`, { method: "POST", body: JSON.stringify({ version_id: versionId }) });

export const listComments = (documentId: string) => apiFetch<Comment[]>(`/api/documents/${documentId}/comments`);

export interface NewComment {
  content: string;
  range_start?: number;
  range_end?: number;
  quote?: string;
}
export const createComment = (documentId: string, comment: NewComment) =>
  apiFetch<Comment>(`/api/documents/${documentId}/comments`, { method: "POST", body: JSON.stringify(comment) });
export const resolveComment = (commentId: string) => apiFetch<Comment>(`/api/comments/${commentId}/resolve`, { method: "POST" });
export const reopenComment = (commentId: string) => apiFetch<Comment>(`/api/comments/${commentId}/reopen`, { method: "POST" });
export const replyToComment = (commentId: string, content: string) =>
  apiFetch<CommentReply>(`/api/comments/${commentId}/replies`, { method: "POST", body: JSON.stringify({ content }) });

/** Revision-checked REST save. Used as a safety net when leaving the page with unsent edits. */
export const updateDocument = (id: string, revision: number, patch: { title?: string; content?: string }) =>
  apiFetch<Document>(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, revision }) });
