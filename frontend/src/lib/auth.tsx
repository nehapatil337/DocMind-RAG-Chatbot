import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, post, refreshSession, setAuthLostHandler, setToken, type AuthResult } from "./api";
import type { User } from "./types";

interface Ctx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const clear = useCallback(() => { setToken(null); setUser(null); qc.clear(); }, [qc]);
  useEffect(() => { setAuthLostHandler(clear); }, [clear]);

  useEffect(() => {
    (async () => {
      if (await refreshSession()) {
        try { setUser(await api<User>("/api/auth/me")); } catch { /* not logged in */ }
      }
      setLoading(false);
    })();
  }, []);

  const adopt = (r: AuthResult) => { setToken(r.access_token); setUser(r.user); };
  const value = useMemo<Ctx>(() => ({
    user, loading, setUser,
    login: async (email, password) => adopt(await post<AuthResult>("/api/auth/login", { email, password })),
    register: async (name, email, password) => adopt(await post<AuthResult>("/api/auth/register", { name, email, password })),
    logout: async () => { try { await post("/api/auth/logout"); } finally { clear(); } },
  }), [user, loading, clear]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
