import io
import logging
import re

from pypdf import PdfReader
from sqlalchemy import delete

from ..db import SessionLocal
from ..config import get_settings
from ..models import Chunk, Document
from .embeddings import embed_texts

log = logging.getLogger("docmind.ingest")
s = get_settings()

ALLOWED = {".pdf", ".txt", ".md", ".markdown"}


def extract_pages(filename: str, data: bytes) -> list[tuple[int, str]]:
    """Return [(page_number, text)]. Text files are treated as one page per ~3000 chars."""
    name = filename.lower()
    if name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ValueError("PDF is password protected")
        return [(i + 1, (p.extract_text() or "")) for i, p in enumerate(reader.pages)]
    text = data.decode("utf-8", errors="ignore")
    step = 3000
    return [(i // step + 1, text[i : i + step]) for i in range(0, max(len(text), 1), step)]


def _clean(t: str) -> str:
    t = t.replace("\x00", "")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def chunk_pages(pages: list[tuple[int, str]], size: int, overlap: int) -> list[tuple[int, str]]:
    """Paragraph/sentence-aware sliding window chunking that remembers the source page."""
    chunks: list[tuple[int, str]] = []
    for page, raw in pages:
        text = _clean(raw)
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(start + size, len(text))
            if end < len(text):
                window = text[start:end]
                cut = max(window.rfind("\n\n"), window.rfind(". "), window.rfind("\n"))
                if cut > size * 0.5:
                    end = start + cut + 1
            piece = text[start:end].strip()
            if len(piece) > 20:
                chunks.append((page, piece))
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)
    return chunks


def ingest_document(doc_id: str, filename: str, data: bytes) -> None:
    """Runs in a background task: parse -> chunk -> embed -> store in pgvector."""
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if not doc:
            return
        try:
            pages = extract_pages(filename, data)
            doc.page_count = len(pages)
            pieces = chunk_pages(pages, s.chunk_size, s.chunk_overlap)
            if not pieces:
                raise ValueError("No extractable text found (is this a scanned PDF?)")
            vectors = embed_texts([p[1] for p in pieces])
            db.execute(delete(Chunk).where(Chunk.document_id == doc_id))
            db.add_all(
                Chunk(document_id=doc_id, user_id=doc.user_id, idx=i, page=pg, content=txt, embedding=vec)
                for i, ((pg, txt), vec) in enumerate(zip(pieces, vectors))
            )
            doc.chunk_count = len(pieces)
            doc.status, doc.error = "ready", None
        except Exception as e:  # noqa: BLE001
            log.exception("ingestion failed for %s", doc_id)
            db.rollback()
            doc = db.get(Document, doc_id)
            if doc:
                doc.status, doc.error = "failed", str(e)[:500]
        db.commit()
    finally:
        db.close()
