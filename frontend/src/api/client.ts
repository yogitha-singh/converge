// Empty string = same origin (production behind nginx). Unset = local dev backend.
const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const ACCESS_KEY = "converge_access_token";
const REFRESH_KEY = "converge_refresh_token";

let accessToken: string | null = localStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken() {
  return accessToken;
}

/** Tell the app the session is over (AuthContext listens and redirects to /login). */
export const LOGOUT_EVENT = "converge:logout";

function forceLogout() {
  clearTokens();
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the refresh token for a new pair. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false);
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const resp = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!resp.ok) {
          forceLogout();
          return false;
        }
        const data = await resp.json();
        setTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false; // network blip: keep the session, caller will retry later
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(errorMessage(detail));
    this.status = status;
    this.detail = detail;
  }
}

/** Turn whatever FastAPI sent back ({detail: string | {message} | [{msg}]}) into a readable sentence. */
export function errorMessage(err: unknown): string {
  const detail = err instanceof ApiError ? err.detail : err;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === "string") return detail[0].msg;
  if (detail && typeof detail === "object") {
    const d = detail as { message?: unknown; error?: unknown };
    if (typeof d.message === "string") return d.message;
    if (typeof d.error === "string") return d.error;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

const NO_REFRESH_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh"];

export async function apiFetch<T = any>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let resp: Response;
  try {
    resp = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (resp.status === 401 && retry && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    if (await refreshAccessToken()) return apiFetch<T>(path, options, false);
    if (!getAccessToken()) forceLogout();
  }

  if (resp.status === 204) return null as T;

  const isJson = resp.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await resp.json() : await resp.text();
  if (!resp.ok) throw new ApiError(resp.status, isJson ? body.detail : body);
  return body as T;
}

function wsBase(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  if (API_URL === "") return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
  return "ws://localhost:8000";
}

export function wsUrl(path: string): string {
  return `${wsBase()}${path}?token=${encodeURIComponent(accessToken ?? "")}`;
}

export { API_URL };
