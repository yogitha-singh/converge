import { apiFetch, clearTokens, setTokens } from "./client";

export interface User {
  id: string;
  email: string;
  name: string;
}

export async function register(email: string, name: string, password: string): Promise<User> {
  return apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ email, name, password }) });
}

export async function login(email: string, password: string): Promise<User> {
  const tokens = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setTokens(tokens.access_token, tokens.refresh_token);
  return me();
}

export async function me(): Promise<User> {
  return apiFetch("/api/auth/me");
}

export function logout() {
  clearTokens();
}
