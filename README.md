# DocMind — chat with your documents

A full-stack RAG (retrieval-augmented generation) app. Upload PDFs / text / Markdown, they are chunked and embedded into **Postgres + pgvector (Supabase)**, then ask questions and get **streamed, cited answers** from free OpenRouter models.

**Stack:** React 19 + TypeScript + Tailwind v4 + TanStack Query · FastAPI + SQLAlchemy · Postgres/Supabase (pgvector, HNSW) · JWT auth · OpenRouter (free chat + free embeddings)

## Features

| Area | What you get |
|---|---|
| Auth | Register / login / logout, short-lived **JWT access token** (in memory) + **rotating refresh token** in an httpOnly cookie, reuse detection, change password, profile |
| Documents | Drag & drop multi-upload (PDF, TXT, MD), background indexing with live status, chunk preview, delete (cascades embeddings), semantic search box |
| RAG chat | Streaming (SSE) answers, inline `[n]` citations → click to see the exact passage, file + page + match %, stop generation, follow-up aware retrieval |
| Scope | Chat with all documents or pick specific ones per conversation |
| Conversations | Multiple chats, auto titles, rename, delete, search, export to Markdown |
| Models | Auto-fallback across several free models when one is rate-limited; choose model, top-k and temperature in Settings |
| UI | Monochrome professional design, dark/light theme, responsive (mobile drawer), skeleton loaders, toasts |
| Security | bcrypt, per-user data isolation on every query, RLS enabled on all tables (blocks Supabase's public API), upload type/size checks |

## Quick start (local)

```bash
cp .env.example .env            # add OPENROUTER_API_KEY (free: https://openrouter.ai/keys) and a JWT_SECRET
docker compose up -d db         # local Postgres with pgvector  (skip if you use Supabase)

# backend  → http://localhost:8000/docs
cd backend && uv sync && uv run uvicorn app.main:app --reload

# frontend → http://localhost:5173
cd frontend && npm install && npm run dev
```

Tables, the `vector` extension and the HNSW index are created automatically on first start.
Try it with `sample/handbook.pdf`.

### Everything in Docker

```bash
docker compose up --build        # web on http://localhost:8080, API on :8000
```

## Using Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string → URI** (use the *Session pooler* string if you need IPv4). Put it in `.env`:
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
3. Start the backend — it runs `CREATE EXTENSION vector`, creates the tables and enables RLS. (If the extension step is denied, enable **pgvector** under *Database → Extensions* once.)

The `postgres://` / `postgresql://` URL styles are both accepted; the transaction pooler (port 6543) works too.

## Configuration

All settings are env vars — see [`.env.example`](.env.example). Highlights:

* `LLM_MODELS` — comma separated, tried in order (free OpenRouter models by default). Any OpenAI-compatible API works via `LLM_BASE_URL`.
* `EMBEDDING_MODEL` / `EMBEDDING_DIM` — default `liquid/lfm-2.5-embedding-350m:free` (1024-dim). The dimension is baked into the `chunks.embedding` column at first start; to switch to a model with another size, drop the `chunks` table (or use a new database) and re-upload.
* `CHUNK_SIZE`, `CHUNK_OVERLAP`, `DEFAULT_TOP_K`, `MIN_SIMILARITY`, `MAX_UPLOAD_MB`.

## How it works

```
upload ─▶ extract text per page (pypdf) ─▶ overlapping chunks ─▶ embeddings (OpenRouter) ─▶ pgvector
question ─▶ embed ─▶ cosine search (user-scoped, optional doc filter) ─▶ prompt with numbered excerpts ─▶ streamed answer + sources
```

## API (excerpt)

`POST /api/auth/{register,login,refresh,logout}` · `GET/PATCH /api/auth/me` · `GET/POST /api/documents` · `GET /api/documents/search?q=` · `DELETE /api/documents/{id}` · `GET/POST /api/conversations` · `POST /api/conversations/{id}/ask` (SSE: `sources`, `token`, `done`, `error`) · `GET /api/conversations/{id}/export`

Interactive docs at `/docs`.

## Tests

```bash
docker compose up -d db
cd backend && TEST_DATABASE_URL=postgresql+psycopg://docmind:docmind@localhost:5432/docmind uv run pytest
cd frontend && npm run build
```

## Project layout

```
backend/app/{routers,services,models.py,security.py,...}   FastAPI app
frontend/src/{pages,components,lib}                         React app
docker-compose.yml · .github/workflows/ci.yml
```

## Ideas to extend

OCR for scanned PDFs, DOCX/URL ingestion, hybrid (BM25 + vector) search, re-ranking, per-user usage limits, Alembic migrations.
