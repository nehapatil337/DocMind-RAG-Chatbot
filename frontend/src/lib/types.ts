export interface User { id: string; email: string; name: string; created_at: string }
export interface Doc {
  id: string; filename: string; content_type: string; size_bytes: number;
  status: "processing" | "ready" | "failed"; error: string | null;
  page_count: number; chunk_count: number; created_at: string;
}
export interface Source { document_id: string; filename: string; page: number; score: number; content: string }
export interface Msg { id: string; role: "user" | "assistant"; content: string; sources: Source[]; model: string | null; created_at: string }
export interface Conv { id: string; title: string; document_ids: string[]; created_at: string; updated_at: string }
export interface ConvDetail extends Conv { messages: Msg[] }
export interface ModelsInfo { models: string[]; default: string | null; default_top_k: number; embedding_model: string }
export interface Stats { documents: number; chunks: number; conversations: number }
