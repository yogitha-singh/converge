import { apiFetch } from "./client";
import type { DocumentStatus, DocumentType } from "./documents";

export interface SearchResult {
  id: string;
  title: string;
  doc_type: DocumentType;
  status: DocumentStatus;
  workspace_id: string;
  workspace_name: string;
  snippet: string | null;
  updated_at: string;
}

export const searchDocuments = (q: string) => apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}&limit=12`);
