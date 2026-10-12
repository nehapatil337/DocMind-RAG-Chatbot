import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { cx } from "../lib/util";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="DocMind">
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <path d="M9 10h9a5 5 0 0 1 0 10H9z" fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-bg" />
      <circle cx="22" cy="22" r="2.5" className="fill-bg" />
    </svg>
  );
}

export const Spinner = ({ size = 16 }: { size?: number }) => <Loader2 size={size} className="animate-spin text-muted" />;

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md" };
export function Button({ variant = "primary", size = "md", className, ...p }: BtnProps) {
  const v = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    outline: "border border-line hover:bg-panel2",
    ghost: "hover:bg-panel2 text-muted hover:text-fg",
    danger: "border border-line text-red-500 hover:bg-red-500/10",
  }[variant];
  return (
    <button
      {...p}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm", v, className)}
    />
  );
}

export function Input({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>}
      <input {...p} className={cx("h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none transition placeholder:text-muted/60 focus:border-fg disabled:opacity-60", className)} />
    </label>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="fade-up w-full max-w-md rounded-2xl border border-line bg-bg p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-panel2"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface Toast { id: number; kind: "ok" | "err"; msg: string }
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, msg }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="fade-up pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm shadow-xl">
            {t.kind === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-500" />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="fade-up flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel text-muted">{icon}</div>
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="max-w-xs text-xs text-muted">{hint}</div>}
      {action}
    </div>
  );
}
