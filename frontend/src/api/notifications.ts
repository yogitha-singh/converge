import { apiFetch } from "./client";

export type NotificationType = "workspace_invite" | "document_added" | "comment_mention" | "comment_reply";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  reference_id: string | null;
  read: boolean;
  created_at: string;
}

export const listNotifications = (unreadOnly = false) =>
  apiFetch<Notification[]>(`/api/notifications${unreadOnly ? "?unread_only=true" : ""}`);
export const markNotificationRead = (id: string) => apiFetch<Notification>(`/api/notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = () => apiFetch<Notification[]>("/api/notifications/read-all", { method: "POST" });
