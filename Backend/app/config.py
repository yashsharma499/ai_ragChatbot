from dotenv import load_dotenv
load_dotenv()

import os


class Config:

    # ========================
    # Security
    # ========================
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET = os.getenv("JWT_SECRET")

    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set")

    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set")

    JWT_EXP_HOURS = int(os.getenv("JWT_EXP_HOURS", 24))

    # ========================
    # MongoDB
    # ========================
    MONGO_URI = os.getenv(
        "MONGO_URI",
        "mongodb://localhost:27017/ai_knowledge"
    )

    # ========================
    # Chunking
    # ========================
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 500))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 100))

    # ========================
    # CORS
    # ========================
    CORS_ORIGINS = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173"
    ).split(",")

    # ========================
    # Groq (LLM)
    # ========================
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set")

    # ========================
    # Embeddings (Local MiniLM)
    # ========================
    EMBED_MODEL = os.getenv(
        "EMBED_MODEL",
        "sentence-transformers/all-MiniLM-L6-v2"
    )

    # ========================
    # Pinecone (Vector DB)
    # ========================
    PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
    PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
    PINECONE_DIMENSION = int(os.getenv("PINECONE_DIMENSION", 384))

    if not PINECONE_API_KEY:
        raise RuntimeError("PINECONE_API_KEY is not set")

    if not PINECONE_INDEX_NAME:
        raise RuntimeError("PINECONE_INDEX_NAME is not set")