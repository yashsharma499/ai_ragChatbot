import logging
import threading
from typing import Dict, List, Optional, Sequence

from app.config import Config
from app.services.embedding_service import (
    AIServiceUnavailable,
    embedding_service,
)

logger = logging.getLogger(__name__)


class VectorService:
    """
    Pinecone access layer. The index handle is a process-wide singleton built on
    first use so importing the app never requires a network round trip.
    """

    _index = None
    _client = None
    _index_lock = threading.Lock()

    def __init__(self):
        self.embedding_service = embedding_service

    @classmethod
    def get_client(cls):
        """
        The Pinecone client itself, shared with EmbeddingService when hosted
        embeddings are enabled so both use one connection.
        """
        if not Config.PINECONE_API_KEY:
            raise AIServiceUnavailable(
                "Vector search is not configured (PINECONE_API_KEY is missing)."
            )

        if cls._client is None:
            with cls._index_lock:
                if cls._client is None:
                    from pinecone import Pinecone

                    cls._client = Pinecone(api_key=Config.PINECONE_API_KEY)
        return cls._client

    @classmethod
    def get_index(cls):
        if not Config.PINECONE_INDEX_NAME:
            raise AIServiceUnavailable(
                "Vector search is not configured (PINECONE_INDEX_NAME is missing)."
            )

        if cls._index is None:
            with cls._index_lock:
                if cls._index is None:
                    logger.info("Connecting to Pinecone index %s", Config.PINECONE_INDEX_NAME)
                    cls._index = cls.get_client().Index(Config.PINECONE_INDEX_NAME)
        return cls._index

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------
    def add_texts(
        self,
        texts: Sequence[str],
        vector_ids: Sequence[str],
        user_id: str,
        document_id: str,
        filename: str,
        chunk_indexes: Optional[Sequence[int]] = None,
    ) -> int:
        """
        Embeds and upserts a batch of chunks. Returns the number of vectors
        written. Upserting in batches instead of one call per chunk is the
        single biggest ingestion speedup.
        """
        if not texts:
            return 0

        index = self.get_index()
        embeddings = self.embedding_service.embed_texts(
            texts, user_id=user_id, input_type="passage"
        )
        chunk_indexes = list(chunk_indexes or range(len(texts)))

        vectors = []
        for text, vector_id, embedding, chunk_index in zip(
            texts, vector_ids, embeddings, chunk_indexes
        ):
            vectors.append(
                {
                    "id": vector_id,
                    "values": embedding,
                    "metadata": {
                        "userId": str(user_id),
                        "documentId": str(document_id),
                        "chunkIndex": int(chunk_index),
                        "filename": filename,
                        # A short preview keeps results readable even if the
                        # Mongo chunk row is ever missing.
                        "preview": text[:180],
                    },
                }
            )

        batch = max(1, Config.PINECONE_UPSERT_BATCH)
        for i in range(0, len(vectors), batch):
            index.upsert(vectors=vectors[i : i + batch])

        return len(vectors)

    def add_text(self, text: str, vector_id: str, metadata: dict, user_id: str):
        """Single-chunk convenience wrapper around `add_texts`."""
        return self.add_texts(
            texts=[text],
            vector_ids=[vector_id],
            user_id=user_id,
            document_id=metadata.get("documentId"),
            filename=metadata.get("filename", ""),
            chunk_indexes=[metadata.get("chunkIndex", 0)],
        )

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------
    def search(
        self,
        query: str,
        user_id: str,
        document_id: str,
        top_k: Optional[int] = None,
        min_score: Optional[float] = None,
    ) -> List[Dict]:
        index = self.get_index()
        top_k = top_k or Config.RAG_TOP_K
        min_score = Config.RAG_MIN_SCORE if min_score is None else min_score

        query_embedding = self.embedding_service.embed_text(
            query, user_id=user_id, input_type="query"
        )

        results = index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter={
                "userId": {"$eq": str(user_id)},
                "documentId": {"$eq": str(document_id)},
            },
        )

        matches = getattr(results, "matches", None) or results.get("matches", [])

        candidates = []
        for match in matches:
            score = getattr(match, "score", None)
            if score is None and isinstance(match, dict):
                score = match.get("score")

            candidates.append(
                {
                    "id": getattr(match, "id", None) or match.get("id"),
                    "metadata": getattr(match, "metadata", None) or match.get("metadata", {}),
                    "score": float(score) if score is not None else 0.0,
                }
            )

        return self._filter_by_relevance(candidates, min_score)

    @staticmethod
    def _filter_by_relevance(candidates, min_score):
        """
        Keeps the best match plus anything close to it.

        A fixed absolute cutoff was rejecting legitimate hits: cosine similarity
        between a short question and a long passage is naturally low, so a real
        answer in a small document could score under 0.2 and be discarded, and
        the user was told nothing relevant existed. Judging each match against
        the best one for *this* query is far more stable across document sizes.
        The absolute floor is kept only to catch a query with no signal at all.
        """
        if not candidates:
            return []

        candidates.sort(key=lambda match: match["score"], reverse=True)
        best = candidates[0]["score"]

        if best < Config.RAG_ABSOLUTE_FLOOR:
            return []

        cutoff = max(min_score, best * Config.RAG_RELATIVE_RATIO)
        kept = [match for match in candidates if match["score"] >= cutoff]

        # The top hit always survives, even if it sits under the cutoff.
        return kept or candidates[:1]

    # ------------------------------------------------------------------
    # Deletes
    # ------------------------------------------------------------------
    def delete_document(self, vector_ids: Sequence[str]) -> int:
        """
        Removes a document's vectors. Deletion by id (rather than by metadata
        filter) works on both serverless and pod-based Pinecone indexes.
        """
        vector_ids = list(vector_ids)
        if not vector_ids:
            return 0

        index = self.get_index()
        batch = max(1, Config.PINECONE_UPSERT_BATCH)
        for i in range(0, len(vector_ids), batch):
            index.delete(ids=vector_ids[i : i + batch])

        return len(vector_ids)
