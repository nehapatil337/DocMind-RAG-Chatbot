import { useState, type ReactNode } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LogOut, Menu, MessageSquare, Moon, Pencil, Plus, Search, Settings, Sun, Trash2, X } from "lucide-react";
import { api, del, patch, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePrefs } from "../lib/prefs";
import type { Conv } from "../lib/types";
import { cx, timeAgo } from "../lib/util";
import { Logo, Modal, Button, Input, useToast } from "./ui";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { prefs, set } = usePrefs();
  const nav = useNavigate();
  const { id: activeId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<Conv | null>(null);
  const [title, setTitle] = useState("");

  const { data: convs = [] } = useQuery({ queryKey: ["convs"], queryFn: () => api<Conv[]>("/api/conversations") });
  const filtered = convs.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

  const create = useMutation({
    mutationFn: () => post<Conv>("/api/conversations", {}),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["convs"] }); nav(`/chat/${c.id}`); setOpen(false); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/conversations/${id}`),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ["convs"] }); if (id === activeId) nav("/chat"); toast("Conversation deleted"); },
  });
  const rename = useMutation({
    mutationFn: () => patch(`/api/conversations/${renaming!.id}`, { title }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["convs"] }); qc.invalidateQueries({ queryKey: ["conv", renaming!.id] }); setRenaming(null); },
  });

  const navCls = ({ isActive }: { isActive: boolean }) =>
    cx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition", isActive ? "bg-panel2 font-medium" : "text-muted hover:bg-panel2 hover:text-fg");

  const sidebar = (
    <aside className="flex h-full w-72 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5 font-semibold"><Logo /> DocMind</div>
        <button className="rounded-md p-1.5 text-muted hover:bg-panel2 lg:hidden" onClick={() => setOpen(false)}><X size={16} /></button>
      </div>
      <div className="px-3">
        <Button onClick={() => create.mutate()} className="w-full justify-start"><Plus size={16} /> New chat</Button>
      </div>
      <nav className="mt-3 grid gap-0.5 px-3" onClick={() => setOpen(false)}>
        <NavLink to="/chat" className={navCls} end={false}><MessageSquare size={16} /> Chat</NavLink>
        <NavLink to="/documents" className={navCls}><FileText size={16} /> Documents</NavLink>
        <NavLink to="/settings" className={navCls}><Settings size={16} /> Settings</NavLink>
      </nav>

      <div className="mt-4 px-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats"
            className="h-8 w-full rounded-lg border border-line bg-bg pl-8 pr-2 text-xs outline-none focus:border-fg" />
        </div>
      </div>
      <div className="mt-2 px-4 text-[11px] font-medium uppercase tracking-wider text-muted">Recent</div>
      <div className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted">{q ? "No matches" : "No conversations yet"}</div>}
        {filtered.map((c) => (
          <div key={c.id} className={cx("group flex items-center rounded-lg transition", c.id === activeId ? "bg-panel2" : "hover:bg-panel2")}>
            <NavLink to={`/chat/${c.id}`} onClick={() => setOpen(false)} className="min-w-0 flex-1 px-3 py-2">
              <div className="truncate text-sm">{c.title}</div>
              <div className="text-[11px] text-muted">{timeAgo(c.updated_at)}</div>
            </NavLink>
            <div className="mr-1 hidden gap-0.5 group-hover:flex">
              <button title="Rename" className="rounded p-1.5 text-muted hover:bg-line hover:text-fg" onClick={() => { setRenaming(c); setTitle(c.title); }}><Pencil size={13} /></button>
              <button title="Delete" className="rounded p-1.5 text-muted hover:bg-line hover:text-red-500" onClick={() => confirm("Delete this conversation?") && remove.mutate(c.id)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5 border-t border-line p-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg">{user!.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user!.name}</div>
          <div className="truncate text-[11px] text-muted">{user!.email}</div>
        </div>
        <button title="Toggle theme" className="rounded-md p-1.5 text-muted hover:bg-panel2 hover:text-fg" onClick={() => set({ theme: prefs.theme === "dark" ? "light" : "dark" })}>
          {prefs.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button title="Sign out" className="rounded-md p-1.5 text-muted hover:bg-panel2 hover:text-fg" onClick={async () => { await logout(); nav("/login"); }}><LogOut size={16} /></button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full">
      <div className="hidden lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative h-full w-fit">{sidebar}</div>
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-line px-3 lg:hidden">
          <button className="rounded-md p-1.5 hover:bg-panel2" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <Logo size={22} /><span className="text-sm font-semibold">DocMind</span>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </main>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename conversation">
        <form onSubmit={(e) => { e.preventDefault(); rename.mutate(); }} className="space-y-4">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>
    </div>
  );
}
