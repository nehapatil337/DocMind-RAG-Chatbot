import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface Prefs { theme: "dark" | "light"; model: string; topK: number; temperature: number }
const KEY = "docmind.prefs";
const DEFAULTS: Prefs = { theme: (localStorage.getItem("docmind.theme") as Prefs["theme"]) || "dark", model: "", topK: 5, temperature: 0.2 };

const Ctx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void }>(null!);
export const usePrefs = () => useContext(Ctx);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; }
  });
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    localStorage.setItem("docmind.theme", prefs.theme);
    document.documentElement.classList.toggle("dark", prefs.theme === "dark");
  }, [prefs]);
  return <Ctx.Provider value={{ prefs, set: (p) => setPrefs((s) => ({ ...s, ...p })) }}>{children}</Ctx.Provider>;
}
