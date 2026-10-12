import os

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import Chunk, Document, User
from ..schemas import DocumentOut, SearchHit
from ..services.embeddings import EmbeddingError
from ..services.ingestion import ALLOWED, ingest_document
from ..services.retrieval import search

router = APIRouter(prefix="/api/documents", tags=["documents"])
s = get_settings()


@router.get("", response_model=list[DocumentOut])
def list_documents(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    ).all()


@router.post("", response_model=list[DocumentOut], status_code=202)
async def upload(
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    out = []
    for f in files:
        name = os.path.basename(f.filename or "document")
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED:
            raise HTTPException(415, f"{name}: unsupported type (allowed: PDF, TXT, MD)")
        data = await f.read()
        if len(data) > s.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"{name}: larger than {s.max_upload_mb} MB")
        if not data:
            raise HTTPException(400, f"{name}: empty file")
        doc = Document(user_id=user.id, filename=name, content_type=f.content_type or "",
                       size_bytes=len(data), status="processing")
        db.add(doc)
        db.commit()
        background.add_task(ingest_document, doc.id, name, data)
        out.append(doc)
    return out


def _own(db: Session, user: User, doc_id: str) -> Document:
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(404, "Document not found")
    return doc


@router.get("/search", response_model=list[SearchHit])
def semantic_search(q: str = Query(min_length=1, max_length=500), top_k: int = Query(8, ge=1, le=30),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        return search(db, user.id, q, top_k, None, 0.0)
    except EmbeddingError as e:
        raise HTTPException(502, str(e))


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _own(db, user, doc_id)


@router.get("/{doc_id}/chunks")
def preview_chunks(doc_id: str, limit: int = Query(20, le=100), user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    _own(db, user, doc_id)
    rows = db.scalars(select(Chunk).where(Chunk.document_id == doc_id).order_by(Chunk.idx).limit(limit))
    return [{"idx": c.idx, "page": c.page, "content": c.content} for c in rows]


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, doc_id))
    db.commit()
