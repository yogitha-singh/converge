import { useCallback, useEffect, useRef, useState } from "react";
import { refreshAccessToken, wsUrl } from "../api/client";
import type { DocumentStatus, DocumentType } from "../api/documents";

export interface PresenceUser {
  user_id: string;
  name: string;
  last_seen: number;
}

export interface CursorInfo {
  user_id: string;
  name: string;
  position: number | null;
  selection_start: number | null;
  selection_end: number | null;
}

export interface OperationMessage {
  revision: number;
  content: string;
  title: string | null;
  editedBy: string;
  editedByName: string;
  origin: string;
}

export interface StaleMessage {
  currentRevision: number;
  currentContent: string;
  currentTitle: string;
}

export interface MetaMessage {
  status: DocumentStatus;
  docType: DocumentType;
  changedByName: string;
}

export interface CommentEventMessage {
  event: "created" | "replied" | "resolved" | "reopened";
  commentId: string;
}

export interface ServerErrorMessage {
  code?: number;
  message: unknown;
}

export type SocketStatus = "connecting" | "open" | "reconnecting" | "denied";

export interface DocumentSocketHandlers {
  onOperation: (msg: OperationMessage) => void;
  onAck: (revision: number) => void;
  onStale: (msg: StaleMessage) => void;
  onPresence: (users: PresenceUser[]) => void;
  onCursor: (cursor: CursorInfo) => void;
  onMeta: (msg: MetaMessage) => void;
  onCommentEvent: (msg: CommentEventMessage) => void;
  onServerError: (msg: ServerErrorMessage) => void;
  /** The socket re-opened after a drop: resync with the server. */
  onReconnect: () => void;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];
const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Owns one document's collaboration socket: connect, heartbeat, reconnect with backoff,
 * token refresh on 4401, give up on 4403, and decode server messages into typed callbacks.
 */
export function useDocumentSocket(documentId: string, handlers: DocumentSocketHandlers) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const everOpenedRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  // Always call the latest handlers without re-creating the socket on every render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    const socket = new WebSocket(wsUrl(`/ws/documents/${documentId}`));
    wsRef.current = socket;

    socket.onopen = () => {
      setStatus("open");
      attemptRef.current = 0;
      heartbeatRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat" }));
      }, HEARTBEAT_INTERVAL_MS);
      if (everOpenedRef.current) handlersRef.current.onReconnect();
      everOpenedRef.current = true;
    };

    socket.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const h = handlersRef.current;
      switch (msg.type) {
        case "operation":
          h.onOperation({
            revision: msg.revision,
            content: msg.content,
            title: msg.title ?? null,
            editedBy: msg.edited_by,
            editedByName: msg.edited_by_name,
            origin: msg.origin ?? "",
          });
          break;
        case "ack":
          h.onAck(msg.revision);
          break;
        case "stale_revision":
          h.onStale({ currentRevision: msg.current_revision, currentContent: msg.current_content, currentTitle: msg.current_title });
          break;
        case "presence":
          h.onPresence(msg.users);
          break;
        case "cursor":
          h.onCursor(msg);
          break;
        case "meta":
          h.onMeta({ status: msg.status, docType: msg.doc_type, changedByName: msg.changed_by_name });
          break;
        case "comment_event":
          h.onCommentEvent({ event: msg.event, commentId: msg.comment_id });
          break;
        case "error":
          h.onServerError({ code: msg.code, message: msg.message });
          break;
        default:
          break;
      }
    };

    socket.onclose = async (event) => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (closedByUsRef.current) return;

      if (event.code === 4403) {
        setStatus("denied"); // authenticated but not allowed: retrying can't help
        return;
      }
      setStatus("reconnecting");

      if (event.code === 4401) {
        // Access token expired. Refresh it, then reconnect right away.
        if (await refreshAccessToken()) {
          attemptRef.current = 0;
          if (!closedByUsRef.current) connect();
        } else {
          setStatus("denied");
        }
        return;
      }

      const delay = RECONNECT_DELAYS_MS[Math.min(attemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
      attemptRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => socket.close();
  }, [documentId]);

  useEffect(() => {
    closedByUsRef.current = false;
    everOpenedRef.current = false;
    setStatus("connecting");
    connect();
    return () => {
      closedByUsRef.current = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((payload: unknown): boolean => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendOperation = useCallback(
    (baseRevision: number, content: string, title: string, clientId: string) =>
      send({ type: "operation", base_revision: baseRevision, content, title, client_id: clientId }),
    [send]
  );

  const sendCursor = useCallback(
    (position: number, selectionStart: number, selectionEnd: number) =>
      send({ type: "cursor", position, selection_start: selectionStart, selection_end: selectionEnd }),
    [send]
  );

  return { status, connected: status === "open", sendOperation, sendCursor };
}
