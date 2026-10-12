import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { api, patch, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePrefs } from "../lib/prefs";
import type { ModelsInfo, User } from "../lib/types";
import { cx } from "../lib/util";
import { Button, Input, Spinner, useToast } from "../components/ui";

function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-b border-line py-7 md:grid-cols-[240px_1fr]">
      <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">{desc}</p></div>
      <div className="max-w-md space-y-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const { prefs, set } = usePrefs();
  const toast = useToast();
  const { data: models } = useQuery({ queryKey: ["models"], queryFn: () => api<ModelsInfo>("/api/models") });
  const [name, setName] = useState(user!.name);
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setBusy("p");
    try { setUser(await patch<User>("/api/auth/me", { name })); toast("Profile updated"); } catch (e: any) { toast(e.message, "err"); } finally { setBusy(null); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setBusy("pw");
    try { await post("/api/auth/change-password", { current_password: cur, new_password: next }); toast("Password changed — please sign in again"); await logout(); }
    catch (e: any) { toast(e.message, "err"); } finally { setBusy(null); }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account and tune how answers are generated.</p>

        <Section title="Appearance" desc="Choose how DocMind looks on this device.">
          <div className="grid grid-cols-2 gap-3">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} onClick={() => set({ theme: t })} className={cx("flex items-center gap-2.5 rounded-xl border p-3.5 text-sm capitalize transition", prefs.theme === t ? "border-fg bg-panel2 font-medium" : "border-line hover:bg-panel")}>
                {t === "dark" ? <Moon size={16} /> : <Sun size={16} />}{t}
              </button>
            ))}
          </div>
        </Section>

        <Section title="AI model" desc="Model used for answers. If it is rate-limited, DocMind automatically falls back to the next one.">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Chat model</span>
            <select value={prefs.model} onChange={(e) => set({ model: e.target.value })} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-fg">
              <option value="">Default ({models?.default?.split("/").pop() ?? "…"})</option>
              {models?.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <div>
            <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-muted">Sources per answer (top-k)</span><span className="tabular-nums">{prefs.topK}</span></div>
            <input type="range" min={1} max={12} value={prefs.topK} onChange={(e) => set({ topK: +e.target.value })} className="w-full accent-[var(--fg)]" />
            <p className="mt-1 text-xs text-muted">More sources give broader context but slower answers.</p>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-muted">Creativity (temperature)</span><span className="tabular-nums">{prefs.temperature.toFixed(1)}</span></div>
            <input type="range" min={0} max={1} step={0.1} value={prefs.temperature} onChange={(e) => set({ temperature: +e.target.value })} className="w-full accent-[var(--fg)]" />
            <p className="mt-1 text-xs text-muted">Lower is more factual, higher is more expressive.</p>
          </div>
          <p className="text-xs text-muted">Embedding model: <span className="font-mono text-fg">{models?.embedding_model ?? "…"}</span></p>
        </Section>

        <Section title="Profile" desc="Your name is shown in the sidebar.">
          <form onSubmit={saveProfile} className="space-y-4">
            <Input label="Email" value={user!.email} disabled />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            <Button type="submit" disabled={busy === "p" || name === user!.name}>{busy === "p" ? <Spinner /> : "Save changes"}</Button>
          </form>
        </Section>

        <Section title="Password" desc="Changing your password signs you out on every device.">
          <form onSubmit={changePw} className="space-y-4">
            <Input label="Current password" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" />
            <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
            <Button type="submit" variant="outline" disabled={busy === "pw"}>{busy === "pw" ? <Spinner /> : "Update password"}</Button>
          </form>
        </Section>

        <Section title="Session" desc="Sign out of this browser.">
          <Button variant="danger" onClick={() => logout()}>Sign out</Button>
        </Section>
      </div>
    </div>
  );
}
