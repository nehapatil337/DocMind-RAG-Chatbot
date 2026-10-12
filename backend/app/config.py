from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # --- Database (Supabase / any Postgres with pgvector) ---
    database_url: str = "postgresql+psycopg://docmind:docmind@localhost:5432/docmind"

    # --- Auth ---
    jwt_secret: str = "change-me-in-production-please-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    cookie_secure: bool = False  # set true behind HTTPS

    # --- LLM / embeddings (any OpenAI-compatible API; default OpenRouter free tier) ---
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = Field(default="", validation_alias="OPENROUTER_API_KEY")
    # Comma separated; tried in order if one is rate-limited / unavailable
    llm_models: str = (
        "google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,"
        "google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free"
    )
    embedding_base_url: str = ""  # defaults to llm_base_url
    embedding_api_key: str = ""  # defaults to llm_api_key
    embedding_model: str = "liquid/lfm-2.5-embedding-350m:free"
    embedding_dim: int = 1024

    # --- RAG ---
    chunk_size: int = 1000
    chunk_overlap: int = 150
    default_top_k: int = 5
    min_similarity: float = 0.15
    max_upload_mb: int = 25

    # --- App ---
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    app_name: str = "DocMind"

    @property
    def model_list(self) -> list[str]:
        return [m.strip() for m in self.llm_models.split(",") if m.strip()]

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def emb_url(self) -> str:
        return self.embedding_base_url or self.llm_base_url

    @property
    def emb_key(self) -> str:
        return self.embedding_api_key or self.llm_api_key

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
