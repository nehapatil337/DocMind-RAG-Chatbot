import logging
import time

import httpx

from ..config import get_settings

log = logging.getLogger("docmind.embeddings")
s = get_settings()


class EmbeddingError(RuntimeError):
    pass


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    """Embed with any OpenAI-compatible /embeddings endpoint (OpenRouter free model by default)."""
    if not s.emb_key:
        raise EmbeddingError("No embedding API key configured (set OPENROUTER_API_KEY).")
    out: list[list[float]] = []
    headers = {"Authorization": f"Bearer {s.emb_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=60) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            for attempt in range(5):
                try:
                    r = client.post(
                        f"{s.emb_url}/embeddings",
                        headers=headers,
                        json={"model": s.embedding_model, "input": batch},
                    )
                    if r.status_code in (429, 500, 502, 503, 504):
                        raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
                    if r.is_error:
                        # Client errors won't succeed on retry; surface the provider's message
                        raise EmbeddingError(f"Embedding request failed ({r.status_code}): {r.text[:500]}")
                    data = sorted(r.json()["data"], key=lambda d: d["index"])
                    vecs = [d["embedding"] for d in data]
                    if vecs and len(vecs[0]) != s.embedding_dim:
                        raise EmbeddingError(
                            f"Model returned {len(vecs[0])}-dim vectors but EMBEDDING_DIM={s.embedding_dim}"
                        )
                    out.extend(vecs)
                    break
                except (httpx.TransportError, httpx.HTTPStatusError) as e:
                    if attempt == 4:
                        raise EmbeddingError(f"Embedding request failed: {e}") from e
                    time.sleep(1.5 * (attempt + 1))
    return out


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]