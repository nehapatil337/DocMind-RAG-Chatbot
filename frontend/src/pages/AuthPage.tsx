import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileSearch, Lock, Quote, Sparkles } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button, Input, Logo, Spinner } from "../components/ui";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (isLogin) await login(email, password); else await register(name, email, password);
      nav("/chat", { replace: true });
    } catch (e: any) { setErr(e.message || "Something went wrong"); } finally { setBusy(false); }
  }

  const features = [
    { icon: FileSearch, t: "Semantic search", d: "Vector embeddings stored in Postgres (pgvector)." },
    { icon: Quote, t: "Cited answers", d: "Every answer links back to document & page." },
    { icon: Lock, t: "Private by design", d: "JWT auth. Your documents are only visible to you." },
    { icon: Sparkles, t: "Free AI models", d: "Runs on free OpenRouter models with auto-fallback." },
  ];

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-panel p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(var(--fg) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold"><Logo size={32} /> DocMind</div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Ask your documents anything.</h1>
          <p className="mt-3 text-muted">Upload PDFs, notes and markdown. Get accurate, cited answers grounded in your own content.</p>
          <div className="mt-10 grid gap-5">
            {features.map(({ icon: I, t, d }) => (
              <div key={t} className="flex gap-3.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-bg"><I size={16} /></div>
                <div><div className="text-sm font-medium">{t}</div><div className="text-sm text-muted">{d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-muted">React · FastAPI · pgvector · Supabase</div>
      </div>

      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="fade-up w-full max-w-sm space-y-4">
          <div className="mb-6 flex items-center gap-2.5 text-lg font-semibold lg:hidden"><Logo /> DocMind</div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{isLogin ? "Welcome back" : "Create your account"}</h2>
            <p className="mt-1 text-sm text-muted">{isLogin ? "Sign in to continue to your workspace." : "Start chatting with your documents in minutes."}</p>
          </div>
          {!isLogin && <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Ada Lovelace" />}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isLogin ? 1 : 8}
            autoComplete={isLogin ? "current-password" : "new-password"} placeholder={isLogin ? "••••••••" : "At least 8 characters"} />
          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Spinner /> : isLogin ? "Sign in" : "Create account"}</Button>
          <p className="text-center text-sm text-muted">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link className="font-medium text-fg underline underline-offset-4" to={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Sign in"}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
