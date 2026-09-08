import logging
import threading
from datetime import datetime
from typing import List, Optional, Sequence

from bson import ObjectId

import app.extensions as extensions
from app.config import Config

logger = logging.getLogger(__name__)


class AIServiceUnavailable(RuntimeError):
    """Raised when an upstream AI dependency is missing or unreachable."""


class EmbeddingService:
    """
    Produces embeddings and generates answers.

    Embeddings come from one of two interchangeable backends, chosen by
    Config.EMBEDDING_BACKEND:

      local     sentence-transformers in-process. No API key, works offline,
                but torch costs ~500MB of RSS - too much for a 512MB free host.
      pinecone  Pinecone's hosted embedding API, reusing the Pinecone key.
                No torch, so the process stays around 80MB.

    Clients are process-wide singletons built on first use. The original code
    constructed a fresh SentenceTransformer inside every service's __init__,
    loading the same model four times per worker.
    """

    _model = None
    _model_lock = threading.Lock()
    _groq_client = None
    _groq_lock = threading.Lock()

    def __init__(self):
        self.chat_model = Config.GROQ_MODEL

    # ------------------------------------------------------------------
    # Lazily-built clients
    # ------------------------------------------------------------------
    @classmethod
    def get_model(cls):
        if cls._model is None:
            with cls._model_lock:
                if cls._model is None:
                    from sentence_transformers import SentenceTransformer

                    logger.info("Loading embedding model %s ...", Config.EMBED_MODEL)
                    cls._model = SentenceTransformer(Config.EMBED_MODEL)
                    logger.info("Embedding model ready")
        return cls._model

    @classmethod
    def get_groq(cls):
        if not Config.GROQ_API_KEY:
            raise AIServiceUnavailable(
                "The AI service is not configured (GROQ_API_KEY is missing)."
            )
        if cls._groq_client is None:
            with cls._groq_lock:
                if cls._groq_client is None:
                    from groq import Groq

                    cls._groq_client = Groq(api_key=Config.GROQ_API_KEY)
        return cls._groq_client

    @classmethod
    def warmup(cls):
        """Preloads the embedding model so the first upload is not slow."""
        try:
            cls.get_model()
        except Exception as e:
            logger.warning("Embedding model warmup failed: %s", e)

    # ------------------------------------------------------------------
    # Embeddings
    # ------------------------------------------------------------------
    def embed_text(self, text: str, user_id=None, input_type: str = "query") -> List[float]:
        """Embeds a single string. Defaults to `query`, the search-side usage."""
        return self.embed_texts([text], user_id=user_id, input_type=input_type)[0]

    def embed_texts(
        self,
        texts: Sequence[str],
        user_id=None,
        input_type: str = "passage",
    ) -> List[List[float]]:
        """
        Embeds a batch in one call.

        `input_type` is "passage" for document chunks and "query" for a user's
        question. Retrieval models are trained asymmetrically, so labelling the
        two sides correctly measurably improves matching. It is ignored by the
        local backend, which has no such distinction.
        """
        if not texts:
            return []

        texts = list(texts)

        if Config.uses_local_embeddings():
            embeddings = self._embed_local(texts)
            model_name = Config.EMBED_MODEL
        else:
            embeddings = self._embed_pinecone(texts, input_type)
            model_name = Config.PINECONE_EMBED_MODEL

        self._log_usage(
            user_id=user_id,
            kind="embedding",
            tokens=sum(len(t.split()) for t in texts),
            model=model_name,
        )

        return embeddings

    def _embed_local(self, texts: List[str]) -> List[List[float]]:
        vectors = self.get_model().encode(
            texts,
            batch_size=Config.EMBED_BATCH_SIZE,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        return [v.tolist() for v in vectors]

    def _embed_pinecone(self, texts: List[str], input_type: str) -> List[List[float]]:
        from app.services.vector_service import VectorService

        client = VectorService.get_client()
        batch = max(1, min(Config.PINECONE_EMBED_BATCH, 96))
        embeddings: List[List[float]] = []

        try:
            # Pinecone rejects requests above 96 inputs, so chunk regardless of
            # how many passages a document produced.
            for start in range(0, len(texts), batch):
                window = texts[start : start + batch]
                result = client.inference.embed(
                    model=Config.PINECONE_EMBED_MODEL,
                    inputs=window,
                    parameters={"input_type": input_type, "truncate": "END"},
                )
                embeddings.extend([list(item["values"]) for item in result.data])
        except Exception as e:
            logger.exception("Pinecone embedding failed")
            raise AIServiceUnavailable(
                "The embedding service is temporarily unavailable. Please try again."
            ) from e

        return embeddings

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------
    def generate_answer(
        self,
        prompt: str,
        user_id=None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> str:
        client = self.get_groq()

        try:
            completion = client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                        or "You are a helpful assistant that answers questions about documents.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as e:
            logger.exception("Groq completion failed (model=%s)", self.chat_model)
            raise AIServiceUnavailable(self._explain_groq_error(e)) from e

        answer = (completion.choices[0].message.content or "").strip()

        # Prefer the provider's real token accounting over a word-count guess.
        usage = getattr(completion, "usage", None)
        tokens = getattr(usage, "total_tokens", None)
        if tokens is None:
            tokens = len(prompt.split()) + len(answer.split())

        self._log_usage(
            user_id=user_id,
            kind="generation",
            tokens=int(tokens),
            model=self.chat_model,
        )

        return answer

    def _explain_groq_error(self, error) -> str:
        """
        Turns provider failures into something an operator can act on. A
        retired model previously surfaced as a generic 500 with no clue that
        GROQ_MODEL was the problem.
        """
        status = getattr(error, "status_code", None)
        detail = str(error).lower()

        if status == 404 or "model_not_found" in detail or "does not exist" in detail:
            return (
                f"The configured AI model '{self.chat_model}' is not available. "
                "Set GROQ_MODEL to a currently served model "
                "(see https://console.groq.com/docs/models)."
            )
        if status == 401 or "invalid api key" in detail:
            return "The AI service rejected the API key. Check GROQ_API_KEY."
        if status == 429 or "rate limit" in detail:
            return "The AI service is rate limited right now. Please try again in a moment."

        return "The AI service is temporarily unavailable. Please try again."

    # ------------------------------------------------------------------
    # Usage accounting
    # ------------------------------------------------------------------
    @staticmethod
    def _log_usage(user_id, kind: str, tokens: int, model: str):
        if not user_id or extensions.db is None:
            return
        try:
            extensions.db.usage_logs.insert_one(
                {
                    "userId": user_id if isinstance(user_id, ObjectId) else ObjectId(user_id),
                    "type": kind,
                    "tokens": int(tokens),
                    "model": model,
                    "createdAt": datetime.utcnow(),
                }
            )
        except Exception as e:
            # Usage accounting must never break the user-facing request.
            logger.warning("Failed to write usage log: %s", e)


# Shared instance used across services.
embedding_service = EmbeddingService()
