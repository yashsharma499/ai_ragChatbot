from dotenv import load_dotenv
load_dotenv()

import os


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(raw)
    except ValueError:
        print(f"[config] {name}={raw!r} is not an integer, using default {default}")
        return default


def _get_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(raw)
    except ValueError:
        print(f"[config] {name}={raw!r} is not a number, using default {default}")
        return default


class Config:

    # ========================
    # Security
    # ========================
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET = os.getenv("JWT_SECRET")

    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set. Copy .env.example to .env and fill it in.")

    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set. Copy .env.example to .env and fill it in.")

    JWT_EXP_HOURS = _get_int("JWT_EXP_HOURS", 24)

    # Emails listed here are promoted to the admin role on registration/login.
    ADMIN_EMAILS = [
        e.strip().lower()
        for e in os.getenv("ADMIN_EMAILS", "").split(",")
        if e.strip()
    ]

    # ========================
    # MongoDB
    # ========================
    MONGO_URI = os.getenv(
        "MONGO_URI",
        "mongodb://localhost:27017/ai_knowledge"
    )

    # ========================
    # Uploads
    # ========================
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads/documents")
    MAX_UPLOAD_MB = _get_int("MAX_UPLOAD_MB", 5)
    MAX_CONTENT_LENGTH = MAX_UPLOAD_MB * 1024 * 1024

    # ========================
    # Chunking
    # ========================
    CHUNK_SIZE = _get_int("CHUNK_SIZE", 900)
    CHUNK_OVERLAP = _get_int("CHUNK_OVERLAP", 150)

    # ========================
    # Retrieval
    # ========================
    RAG_TOP_K = _get_int("RAG_TOP_K", 6)
    # Relevance is judged relative to the best match for each query rather than
    # against a fixed number, because absolute cosine scores vary a lot with
    # passage length. Keep matches scoring at least this fraction of the best.
    RAG_RELATIVE_RATIO = _get_float("RAG_RELATIVE_RATIO", 0.6)
    # Hard floor, only to reject a query with no signal at all.
    RAG_ABSOLUTE_FLOOR = _get_float("RAG_ABSOLUTE_FLOOR", 0.08)
    # Additional absolute cutoff applied on top of the relative one.
    RAG_MIN_SCORE = _get_float("RAG_MIN_SCORE", 0.0)
    # How many previous Q/A turns to feed back into the prompt.
    RAG_HISTORY_TURNS = _get_int("RAG_HISTORY_TURNS", 3)

    # ========================
    # CORS
    # ========================
    CORS_ORIGINS = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]

    # ========================
    # Rate limiting
    # ========================
    # Defaults to in-memory. Set to e.g. redis://... for multi-worker deployments.
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_AUTH = os.getenv("RATELIMIT_AUTH", "10 per minute")
    RATELIMIT_UPLOAD = os.getenv("RATELIMIT_UPLOAD", "10 per minute")
    RATELIMIT_CHAT = os.getenv("RATELIMIT_CHAT", "20 per minute")
    RATELIMIT_READ = os.getenv("RATELIMIT_READ", "120 per minute")

    # ========================
    # Groq (LLM)
    # ========================
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    # Groq retires models regularly; llama-3.1-8b-instant has been decommissioned.
    # See https://console.groq.com/docs/models for what is currently served.
    GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    # ========================
    # Embeddings (local MiniLM)
    # ========================
    EMBED_MODEL = os.getenv(
        "EMBED_MODEL",
        "sentence-transformers/all-MiniLM-L6-v2"
    )
    EMBED_BATCH_SIZE = _get_int("EMBED_BATCH_SIZE", 32)

    # ========================
    # Pinecone (Vector DB)
    # ========================
    PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
    PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
    PINECONE_DIMENSION = _get_int("PINECONE_DIMENSION", 384)
    PINECONE_UPSERT_BATCH = _get_int("PINECONE_UPSERT_BATCH", 100)

    @classmethod
    def missing_ai_keys(cls):
        """
        Keys the RAG pipeline needs. The app still boots without them so the UI
        and auth flows work; document/chat endpoints return a clear 503 instead.
        """
        missing = []
        if not cls.GROQ_API_KEY:
            missing.append("GROQ_API_KEY")
        if not cls.PINECONE_API_KEY:
            missing.append("PINECONE_API_KEY")
        if not cls.PINECONE_INDEX_NAME:
            missing.append("PINECONE_INDEX_NAME")
        return missing
