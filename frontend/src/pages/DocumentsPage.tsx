import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, FileUp, Loader2, MessageSquare, Search, Trash2, UploadCloud } from "lucide-react";
import { api, del, post } from "../lib/api";
import type { Doc, Stats } from "../lib/types";
import { cx, fmtDate, fmtSize } from "../lib/util";
import { Button, Empty, Input, Spinner, useToast } from "../components/ui";

interface Hit { document_id: string; filename: string; page: number; score: number; content: string }
const ALLOWED = [".pdf", ".txt", ".md", ".markdown"];

export default function DocumentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["docs"], queryFn: () => api<Doc[]>("/api/documents"),
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === "processing") ? 1500 : false),
  });
  const { data: stats } = useQuery({ queryKey: ["stats", docs.length, docs.filter((d) => d.status === "ready").length], queryFn: () => api<Stats>("/api/stats") });

  const upload = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    const bad = files.filter((f) => !ALLOWED.some((e) => f.name.toLowerCase().endsWith(e)));
    if (bad.length) { toast(`Unsupported: ${bad.map((b) => b.name).join(", ")} (use PDF, TXT or MD)`, "err"); return; }
    if (!files.length) return;
    const fd = new FormData(); files.forEach((f) => fd.append("files", f));
    setUploading(true);
    try { await api("/api/documents", { method: "POST", body: fd }); toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""} — indexing…`); qc.invalidateQueries({ queryKey: ["docs"] }); }
    catch (e: any) { toast(e.message, "err"); }
    finally { setUploading(false); }
  }, [qc, toast]);

  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs"] }); toast("Document deleted"); },
  });

  async function runSearch(e: React.FormEvent) {
    e.preventDefault(); if (!q.trim()) { setHits(null); return; }
    setSearching(true);
    try { setHits(await api<Hit[]>(`/api/documents/search?q=${encodeURIComponent(q)}&top_k=8`)); }
    catch (e: any) { toast(e.message, "err"); } finally { setSearching(false); }
  }

  const shown = docs.filter((d) => d.filename.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-muted">Upload files to build your private knowledge base.</p>
          </div>
          <div className="flex gap-6 text-sm">
            {[["Documents", stats?.documents], ["Chunks", stats?.chunks], ["Chats", stats?.conversations]].map(([l, v]) => (
              <div key={l as string}><div className="text-xl font-semibold tabular-nums">{v ?? "–"}</div><div className="text-xs text-muted">{l}</div></div>
            ))}
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          className={cx("mt-6 cursor-pointer rounded-2xl border border-dashed p-10 text-center transition", drag ? "border-fg bg-panel2" : "border-line bg-panel hover:border-fg/40")}
        >
          <input ref={input} type="file" multiple hidden accept=".pdf,.txt,.md,.markdown" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-line bg-bg">{uploading ? <Spinner size={20} /> : <UploadCloud size={20} />}</div>
          <div className="mt-3 text-sm font-medium">{drag ? "Drop to upload" : "Drag & drop files, or click to browse"}</div>
          <div className="mt-1 text-xs text-muted">PDF, TXT, Markdown · up to 25 MB each · embeddings are generated automatically</div>
        </div>

        <form onSubmit={runSearch} className="mt-8 flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setHits(null); }} placeholder="Semantic search across all documents…" className="pl-9" />
          </div>
          <Button type="submit" variant="outline" disabled={searching}>{searching ? <Spinner /> : "Search"}</Button>
        </form>
        {hits && (
          <div className="fade-up mt-3 space-y-2">
            {hits.length === 0 && <div className="rounded-xl border border-line p-4 text-sm text-muted">No matches found.</div>}
            {hits.map((h, i) => (
              <div key={i} className="rounded-xl border border-line bg-panel p-3.5">
                <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium">{h.filename} · p.{h.page}</span><span className="text-muted">{Math.round(h.score * 100)}% match</span></div>
                <p className="line-clamp-3 text-xs leading-relaxed text-muted">{h.content}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Library <span className="ml-1 text-muted">{docs.length}</span></h2>
          {docs.length > 4 && <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="h-8 w-48 text-xs" />}
        </div>

        <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {isLoading && [0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}
          {!isLoading && shown.length === 0 && <Empty icon={<FileUp size={20} />} title={docs.length ? "No matching documents" : "No documents yet"} hint={docs.length ? undefined : "Upload your first file to start asking questions."} />}
          {shown.map((d) => (
            <div key={d.id} className="bg-bg">
              <div className="flex items-center gap-3 p-3.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-panel"><FileText size={18} className="text-muted" /></div>
                <button className="min-w-0 flex-1 text-left" onClick={() => d.status === "ready" && setExpanded(expanded === d.id ? null : d.id)}>
                  <div className="truncate text-sm font-medium">{d.filename}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{fmtSize(d.size_bytes)}</span><span>·</span><span>{fmtDate(d.created_at)}</span>
                    {d.status === "ready" && <><span>·</span><span>{d.page_count} page{d.page_count === 1 ? "" : "s"}</span><span>·</span><span>{d.chunk_count} chunks</span></>}
                  </div>
                </button>
                <StatusBadge d={d} />
                {d.status === "ready" && <>
                  <Button size="sm" variant="outline" onClick={() => nav("/chat")} title="Start a chat"><MessageSquare size={13} /> Chat</Button>
                  <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="rounded-md p-1.5 text-muted hover:bg-panel2"><ChevronDown size={16} className={cx("transition", expanded === d.id && "rotate-180")} /></button>
                </>}
                <button title="Delete" onClick={() => confirm(`Delete "${d.filename}" and its embeddings?`) && remove.mutate(d.id)} className="rounded-md p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
              {d.status === "failed" && <div className="px-4 pb-3.5 text-xs text-red-500">{d.error}</div>}
              {expanded === d.id && <ChunkPreview id={d.id} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ d }: { d: Doc }) {
  if (d.status === "processing") return <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted"><Loader2 size={12} className="animate-spin" />Indexing</span>;
  if (d.status === "failed") return <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-2.5 py-1 text-xs text-red-500"><AlertTriangle size={12} />Failed</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs"><CheckCircle2 size={12} />Ready</span>;
}

function ChunkPreview({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["chunks", id], queryFn: () => api<{ idx: number; page: number; content: string }[]>(`/api/documents/${id}/chunks?limit=6`) });
  return (
    <div className="fade-up space-y-2 border-t border-line bg-panel px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Indexed content preview</div>
      {isLoading && <Spinner />}
      {data?.map((c) => (
        <div key={c.idx} className="rounded-lg border border-line bg-bg p-3 text-xs">
          <div className="mb-1 text-[11px] text-muted">Chunk {c.idx + 1} · page {c.page}</div>
          <p className="line-clamp-4 whitespace-pre-wrap leading-relaxed text-muted">{c.content}</p>
        </div>
      ))}
    </div>
  );
}
