import type { Source, User } from "./types";

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
export const setToken = (t: string | null) => { accessToken = t; };
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function parseError(r: Response): Promise<ApiError> {
  let msg = r.statusText;
  try {
    const j = await r.json();
    msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join(", ") : msg;
  } catch { /* ignore */ }
  return new ApiError(r.status, msg);
}

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return false;
      const j = await r.json();
      accessToken = j.access_token;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const r = await fetch(path, { ...init, headers, credentials: "include" });
  if (r.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (await refreshSession()) return raw(path, init, false);
    onAuthLost?.();
  }
  return r;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await raw(path, init);
  if (!r.ok) throw await parseError(r);
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get("content-type") || "";
  return (ct.includes("json") ? r.json() : r.text()) as Promise<T>;
}

export const post = <T,>(p: string, body?: unknown) =>
  api<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T,>(p: string, body: unknown) => api<T>(p, { method: "PATCH", body: JSON.stringify(body) });
export const del = (p: string) => api<void>(p, { method: "DELETE" });

export interface AuthResult { access_token: string; user: User }

export interface AskHandlers {
  onSources: (s: Source[]) => void;
  onToken: (t: string) => void;
  onDone: (d: { message_id: string; model: string | null; title: string | null }) => void;
  onError: (m: string) => void;
}

/** Streams an answer over SSE using fetch (so the Authorization header and abort work). */
export async function ask(
  convId: string,
  body: { question: string; model?: string; top_k?: number; temperature?: number },
  h: AskHandlers,
  signal: AbortSignal,
) {
  const r = await raw(`/api/conversations/${convId}/ask`, { method: "POST", body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) { h.onError((await parseError(r)).message); return; }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = "message", data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const p = JSON.parse(data);
      if (ev === "sources") h.onSources(p);
      else if (ev === "token") h.onToken(p);
      else if (ev === "done") h.onDone(p);
      else if (ev === "error") h.onError(p.message);
    }
  }
}
