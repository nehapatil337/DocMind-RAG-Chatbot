from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Chunk, Document
from .embeddings import embed_query


def search(db: Session, user_id: str, query: str, top_k: int, document_ids: list[str] | None,
           min_similarity: float = 0.0) -> list[dict]:
    qvec = embed_query(query)
    dist = Chunk.embedding.cosine_distance(qvec)
    stmt = (
        select(Chunk, Document.filename, dist.label("dist"))
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.user_id == user_id, Document.status == "ready")
        .order_by(dist)
        .limit(top_k)
    )
    if document_ids:
        stmt = stmt.where(Chunk.document_id.in_(document_ids))
    hits = []
    for rank, (chunk, filename, d) in enumerate(db.execute(stmt)):
        score = 1.0 - float(d)
        # Drop weak matches, but always keep the best 2 so broad questions
        # ("summarize this") still get context to work with.
        if score < min_similarity and rank >= 2:
            continue
        hits.append({
            "document_id": chunk.document_id,
            "filename": filename,
            "page": chunk.page,
            "score": round(score, 4),
            "content": chunk.content,
        })
    return hits
