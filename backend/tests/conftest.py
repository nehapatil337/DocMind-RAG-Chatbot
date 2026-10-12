import hashlib
import os

# Tests need a Postgres with pgvector (see docker-compose.yml). Override with TEST_DATABASE_URL.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://docmind:docmind@localhost:5433/docmind"
)
os.environ["OPENROUTER_API_KEY"] = "test-key"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services import embeddings, ingestion, llm, retrieval  # noqa: E402
from app.routers import chats  # noqa: E402

DIM = get_settings().embedding_dim


def fake_embed(texts, batch_size=32):
    """Deterministic bag-of-words hash embedding so retrieval is testable offline."""
    out = []
    for t in texts:
        v = [0.0] * DIM
        for w in t.lower().split():
            v[int(hashlib.md5(w.strip(".,?!").encode()).hexdigest(), 16) % DIM] += 1.0
        out.append(v)
    return out


def fake_stream(messages, model, temperature):
    ctx = messages[-1]["content"]
    yield "fake-model", "Answer based on: "
    yield "fake-model", ctx.split("\n")[2][:40] if "[1]" in ctx else "nothing"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _patch_ai(monkeypatch):
    monkeypatch.setattr(embeddings, "embed_texts", fake_embed)
    monkeypatch.setattr(ingestion, "embed_texts", fake_embed)
    monkeypatch.setattr(retrieval, "embed_query", lambda t: fake_embed([t])[0])
    monkeypatch.setattr(chats, "stream_chat", fake_stream)


@pytest.fixture
def auth(client):
    email = f"user-{os.urandom(4).hex()}@example.com"
    r = client.post("/api/auth/register", json={"name": "Tester", "email": email, "password": "supersecret1"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, email
