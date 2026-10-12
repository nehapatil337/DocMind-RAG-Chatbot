import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

log = logging.getLogger("docmind.db")
settings = get_settings()

# prepare_threshold=None keeps us compatible with Supabase's transaction pooler (pgbouncer)
engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Enable pgvector, create tables + ANN index, lock tables down with RLS."""
    from . import models  # noqa: F401  (register tables)

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw "
                "ON chunks USING hnsw (embedding vector_cosine_ops)"
            )
        )
        # On Supabase every public table is exposed through PostgREST. Our API connects as the
        # table owner (bypasses RLS), so enabling RLS with no policies blocks the public anon API.
        for table in ("users", "refresh_tokens", "documents", "chunks", "conversations", "messages"):
            conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
    log.info("database ready")
