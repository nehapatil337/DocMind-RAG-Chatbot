import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal, get_db
from ..deps import current_user
from ..models import Conversation, Document, Message, User
from ..schemas import (AskIn, ConversationCreate, ConversationDetail, ConversationOut,
                       ConversationUpdate)
from ..services.embeddings import EmbeddingError
from ..services.llm import LLMError, build_messages, stream_chat
from ..services.retrieval import search

router = APIRouter(prefix="/api", tags=["chat"])
s = get_settings()
log = logging.getLogger("docmind.chat")


def _conv(db: Session, user: User, cid: str) -> Conversation:
    c = db.get(Conversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return c


def _valid_docs(db: Session, user: User, ids: list[str]) -> list[str]:
    if not ids:
        return []
    owned = set(db.scalars(select(Document.id).where(Document.user_id == user.id,
                                                      Document.id.in_(ids))))
    return [i for i in ids if i in owned]


@router.get("/models")
def models():
    return {"models": s.model_list, "default": s.model_list[0] if s.model_list else None,
            "default_top_k": s.default_top_k, "embedding_model": s.embedding_model}


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Conversation).where(Conversation.user_id == user.id)
                      .order_by(Conversation.updated_at.desc())).all()


@router.post("/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(body: ConversationCreate, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    c = Conversation(user_id=user.id, title=body.title or "New chat",
                     document_ids=_valid_docs(db, user, body.document_ids))
    db.add(c)
    db.commit()
    return c


@router.get("/conversations/{cid}", response_model=ConversationDetail)
def get_conversation(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _conv(db, user, cid)


@router.patch("/conversations/{cid}", response_model=ConversationOut)
def update_conversation(cid: str, body: ConversationUpdate, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    c = _conv(db, user, cid)
    if body.title is not None:
        c.title = body.title.strip() or c.title
    if body.document_ids is not None:
        c.document_ids = _valid_docs(db, user, body.document_ids)
    db.commit()
    return c


@router.delete("/conversations/{cid}", status_code=204)
def delete_conversation(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_conv(db, user, cid))
    db.commit()


@router.get("/conversations/{cid}/export", response_class=PlainTextResponse)
def export_conversation(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _conv(db, user, cid)
    lines = [f"# {c.title}\n"]
    for m in c.messages:
        lines.append(f"**{'You' if m.role == 'user' else 'DocMind'}:**\n\n{m.content}\n")
        if m.sources:
            refs = "; ".join(f"[{i}] {x['filename']} p.{x['page']}" for i, x in enumerate(m.sources, 1))
            lines.append(f"_Sources: {refs}_\n")
    return "\n".join(lines)


@router.delete("/messages/{mid}", status_code=204)
def delete_message(mid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Message, mid)
    if not m or _conv(db, user, m.conversation_id) is None:
        raise HTTPException(404, "Message not found")
    db.delete(m)
    db.commit()


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/conversations/{cid}/ask")
def ask(cid: str, body: AskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Retrieve relevant chunks, stream the answer over SSE, persist both messages."""
    conv = _conv(db, user, cid)
    question = body.question.strip()
    history = [{"role": m.role, "content": m.content} for m in conv.messages]
    doc_ids = list(conv.document_ids or [])
    is_first = len(history) == 0
    top_k = body.top_k or s.default_top_k
    temperature = 0.2 if body.temperature is None else body.temperature
    user_id, conv_id = user.id, conv.id

    db.add(Message(conversation_id=conv_id, role="user", content=question))
    db.commit()

    def gen():
        sess = SessionLocal()
        answer, used_model, hits = [], None, []
        try:
            # follow-up questions are often short; enrich the retrieval query with prior context
            last_user = next((h["content"] for h in reversed(history) if h["role"] == "user"), "")
            query = question if len(question.split()) > 6 or not last_user else f"{last_user}\n{question}"
            try:
                hits = search(sess, user_id, query, top_k, doc_ids or None, s.min_similarity)
            except EmbeddingError as e:
                yield _sse("error", {"message": f"Retrieval failed: {e}"})
                return
            sources = [{"document_id": h["document_id"], "filename": h["filename"], "page": h["page"],
                        "score": h["score"], "content": h["content"][:600]} for h in hits]
            yield _sse("sources", sources)
            try:
                for used_model, tok in stream_chat(build_messages(question, hits, history),
                                                   body.model, temperature):
                    answer.append(tok)
                    yield _sse("token", tok)
            except LLMError as e:
                yield _sse("error", {"message": str(e)})
                if not answer:
                    return
            text = "".join(answer)
            msg = Message(conversation_id=conv_id, role="assistant", content=text, sources=sources,
                          model=used_model)
            sess.add(msg)
            c = sess.get(Conversation, conv_id)
            if c and is_first and c.title == "New chat":
                c.title = (question[:60] + "…") if len(question) > 60 else question
            sess.commit()
            yield _sse("done", {"message_id": msg.id, "model": used_model,
                                "title": c.title if c else None})
        except GeneratorExit:
            # client pressed "stop": keep what we streamed so far
            if answer:
                sess.add(Message(conversation_id=conv_id, role="assistant",
                                 content="".join(answer), sources=[], model=used_model))
                sess.commit()
            raise
        finally:
            sess.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/stats")
def stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    docs = db.scalar(select(func.count()).select_from(Document).where(Document.user_id == user.id))
    chunks = db.scalar(select(func.coalesce(func.sum(Document.chunk_count), 0))
                       .where(Document.user_id == user.id))
    convs = db.scalar(select(func.count()).select_from(Conversation)
                      .where(Conversation.user_id == user.id))
    return {"documents": docs, "chunks": int(chunks), "conversations": convs}
