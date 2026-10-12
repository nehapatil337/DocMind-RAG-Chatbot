import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowUp, Check, ChevronDown, Copy, Download, FileText, FolderOpen, Lightbulb, ListChecks, Square, Sparkles, Quote } from "lucide-react";
import { api, ask, patch, post } from "../lib/api";
import { usePrefs } from "../lib/prefs";
import type { Conv, ConvDetail, Doc, ModelsInfo, Msg, Source } from "../lib/types";
import { cx } from "../lib/util";
import Markdown from "../components/Markdown";
import { Logo, Spinner, useToast } from "../components/ui";

const SUGGESTIONS = [
  { icon: ListChecks, t: "Summarize the key points of my documents" },
  { icon: Lightbulb, t: "What are the main conclusions or recommendations?" },
  { icon: Quote, t: "List any important dates, numbers, or names mentioned" },
  { icon: Sparkles, t: "Explain the most complex idea in simple terms" },
];

export default function ChatPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { prefs } = usePrefs();

  const { data: docs = [] } = useQuery({ queryKey: ["docs"], queryFn: () => api<Doc[]>("/api/documents") });
  const { data: models } = useQuery({ queryKey: ["models"], queryFn: () => api<ModelsInfo>("/api/models") });
  const { data: conv, isLoading } = useQuery({
    queryKey: ["conv", id], enabled: !!id,
    queryFn: () => api<ConvDetail>(`/api/conversations/${id}`),
  });

  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [stream, setStream] = useState<{ text: string; sources: Source[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const busy = pendingUser !== null;
  const readyDocs = docs.filter((d) => d.status === "ready");

  useEffect(() => { if (conv) setScope(conv.document_ids); }, [conv?.id]);
  useEffect(() => { setStream(null); setPendingUser(null); setError(null); }, [id]);

  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (near || busy) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length, stream?.text, pendingUser]);

  const send = useCallback(async (convId: string, question: string) => {
    setError(null); setPendingUser(question); setStream({ text: "", sources: [] });
    const ctl = new AbortController(); abort.current = ctl;
    let failed = false;
    try {
      await ask(convId, { question, model: prefs.model || undefined, top_k: prefs.topK, temperature: prefs.temperature }, {
        onSources: (sources) => setStream((s) => ({ text: s?.text ?? "", sources })),
        onToken: (t) => setStream((s) => ({ text: (s?.text ?? "") + t, sources: s?.sources ?? [] })),
        onDone: () => {},
        onError: (m) => { failed = true; setError(m); },
      }, ctl.signal);
    } catch (e: any) { if (e.name !== "AbortError") { failed = true; setError(e.message || "Connection lost"); } }
    abort.current = null;
    await qc.invalidateQueries({ queryKey: ["conv", convId] });
    qc.invalidateQueries({ queryKey: ["convs"] });
    setPendingUser(null); setStream(null);
    void failed;
  }, [prefs.model, prefs.topK, prefs.temperature, qc]);

  // when arriving from /chat with a first question
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    const first = (loc.state as { first?: string } | null)?.first;
    if (id && first && startedFor.current !== id) {
      startedFor.current = id;
      nav(loc.pathname, { replace: true, state: null });
      void send(id, first);
    }
  }, [id, loc.state]);  // eslint-disable-line

  const create = useMutation({
    mutationFn: () => post<Conv>("/api/conversations", { document_ids: scope }),
  });

  async function submit(question: string) {
    if (busy) return;
    if (!id) {
      const c = await create.mutateAsync();
      qc.setQueryData(["conv", c.id], { ...c, messages: [] } satisfies ConvDetail);
      qc.invalidateQueries({ queryKey: ["convs"] });
      nav(`/chat/${c.id}`, { state: { first: question } });
      return;
    }
    void send(id, question);
  }

  async function updateScope(next: string[]) {
    setScope(next);
    if (id) { await patch(`/api/conversations/${id}`, { document_ids: next }); qc.invalidateQueries({ queryKey: ["conv", id] }); }
  }

  async function exportMd() {
    const md = await api<string>(`/api/conversations/${id}/export`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${(conv?.title || "chat").replace(/[^\w-]+/g, "_")}.md`; a.click();
  }

  const messages: Msg[] = conv?.messages ?? [];
  const showEmpty = !id || (!isLoading && messages.length === 0 && !busy);
  const noDocs = docs.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="min-w-0 truncate text-sm font-medium">{id ? conv?.title ?? "…" : "New chat"}</div>
        <div className="flex items-center gap-2">
          <ScopePicker docs={readyDocs} value={scope} onChange={updateScope} />
          {id && messages.length > 0 && (
            <button title="Export as Markdown" onClick={exportMd} className="rounded-lg border border-line p-2 text-muted hover:bg-panel2 hover:text-fg"><Download size={14} /></button>
          )}
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && id ? (
          <div className="mx-auto max-w-3xl space-y-4 p-6">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : showEmpty ? (
          <div className="fade-up mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 pb-10 text-center">
            <Logo size={48} />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">What would you like to know?</h1>
            <p className="mt-2 text-sm text-muted">
              {noDocs ? "Upload a document first, then ask questions about it." : `Searching ${scope.length ? `${scope.length} selected` : `all ${readyDocs.length}`} document${(scope.length || readyDocs.length) === 1 ? "" : "s"}.`}
            </p>
            {noDocs ? (
              <button onClick={() => nav("/documents")} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"><FolderOpen size={16} /> Add documents</button>
            ) : (
              <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map(({ icon: I, t }) => (
                  <button key={t} onClick={() => submit(t)} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3.5 text-left text-sm transition hover:border-fg/40 hover:bg-panel2">
                    <I size={16} className="mt-0.5 shrink-0 text-muted" /><span>{t}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
            {messages.map((m) => <Bubble key={m.id} m={m} />)}
            {pendingUser !== null && (
              <>
                <Bubble m={{ id: "p", role: "user", content: pendingUser, sources: [], model: null, created_at: "" }} />
                <Bubble m={{ id: "s", role: "assistant", content: stream?.text ?? "", sources: stream?.sources ?? [], model: null, created_at: "" }} streaming />
              </>
            )}
            {error && (
              <div className="fade-up flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-500">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /><div><div className="font-medium">Couldn't complete the answer</div><div className="opacity-90">{error}</div></div>
              </div>
            )}
          </div>
        )}
      </div>

      <Composer busy={busy} disabled={create.isPending} onSend={submit} onStop={() => abort.current?.abort()} hint={models?.default ? (prefs.model || models.default).split("/").pop()!.replace(":free", "") : ""} />
    </div>
  );
}

function Bubble({ m, streaming }: { m: Msg; streaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const isUser = m.role === "user";
  if (isUser) {
    return (
      <div className="fade-up flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-fg">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="fade-up flex gap-3">
      <div className="mt-0.5 shrink-0"><Logo size={26} /></div>
      <div className="min-w-0 flex-1">
        {streaming && !m.content ? (
          <div className="flex h-7 items-center gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="dot" style={{ animationDelay: `${i * 0.15}s` }} />)}
            <span className="ml-2 text-xs text-muted">{m.sources.length ? "Writing answer…" : "Searching documents…"}</span></div>
        ) : (
          <Markdown text={m.content} sources={m.sources} streaming={streaming} onCite={(n) => setOpen(open === n ? null : n)} />
        )}
        {m.sources.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {m.sources.map((s, i) => (
                <button key={i} onClick={() => setOpen(open === i + 1 ? null : i + 1)}
                  className={cx("inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition", open === i + 1 ? "border-fg bg-panel2" : "border-line text-muted hover:border-fg/40 hover:text-fg")}>
                  <span className="grid h-4 w-4 place-items-center rounded bg-panel2 text-[10px] font-semibold text-fg">{i + 1}</span>
                  <FileText size={12} className="shrink-0" /><span className="max-w-[160px] truncate">{s.filename}</span><span className="opacity-60">p.{s.page}</span>
                </button>
              ))}
            </div>
            {open && m.sources[open - 1] && (
              <div className="fade-up rounded-xl border border-line bg-panel p-3.5 text-xs">
                <div className="mb-1.5 flex items-center justify-between text-muted">
                  <span className="font-medium text-fg">{m.sources[open - 1].filename} · page {m.sources[open - 1].page}</span>
                  <span>{Math.round(m.sources[open - 1].score * 100)}% match</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed text-muted">{m.sources[open - 1].content}</p>
              </div>
            )}
          </div>
        )}
        {!streaming && m.content && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied" : "Copy"}
            </button>
            {m.model && <span className="opacity-70">{m.model.split("/").pop()?.replace(":free", "")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ busy, disabled, onSend, onStop, hint }: { busy: boolean; disabled: boolean; onSend: (q: string) => void; onStop: () => void; hint: string }) {
  const [v, setV] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }, [v]);
  const go = () => { const q = v.trim(); if (!q || busy || disabled) return; setV(""); onSend(q); };
  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-panel p-2 pl-4 transition focus-within:border-fg/60">
          <textarea ref={ta} value={v} rows={1} onChange={(e) => setV(e.target.value)} placeholder="Ask a question about your documents…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }}
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted/70" />
          {busy ? (
            <button onClick={onStop} title="Stop generating" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg"><Square size={13} fill="currentColor" /></button>
          ) : (
            <button onClick={go} disabled={!v.trim() || disabled} title="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-30">
              {disabled ? <Spinner /> : <ArrowUp size={16} />}
            </button>
          )}
        </div>
        <div className="mt-2 text-center text-[11px] text-muted">Enter to send · Shift+Enter for new line{hint && ` · ${hint}`} · Answers may contain errors — check the cited sources.</div>
      </div>
    </div>
  );
}

function ScopePicker({ docs, value, onChange }: { docs: Doc[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const label = value.length === 0 ? "All documents" : `${value.length} selected`;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-xs hover:bg-panel2">
        <FolderOpen size={13} className="text-muted" />{label}<ChevronDown size={13} className="text-muted" />
      </button>
      {open && (
        <div className="fade-up absolute right-0 top-10 z-30 w-72 rounded-xl border border-line bg-bg p-1.5 shadow-2xl">
          <button onClick={() => onChange([])} className={cx("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-panel2", value.length === 0 && "font-medium")}>All documents{value.length === 0 && <Check size={13} />}</button>
          <div className="my-1 border-t border-line" />
          <div className="max-h-64 overflow-y-auto">
            {docs.length === 0 && <div className="px-2.5 py-3 text-xs text-muted">No ready documents</div>}
            {docs.map((d) => (
              <button key={d.id} onClick={() => toggle(d.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-panel2">
                <span className={cx("grid h-4 w-4 shrink-0 place-items-center rounded border", value.includes(d.id) ? "border-fg bg-accent text-accent-fg" : "border-line")}>{value.includes(d.id) && <Check size={11} />}</span>
                <span className="truncate">{d.filename}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
