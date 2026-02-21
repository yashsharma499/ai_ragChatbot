from pinecone import Pinecone
from app.config import Config
from app.services.embedding_service import EmbeddingService


class VectorService:
    def __init__(self):
        # Initialize embedding service (MiniLM local)
        self.embedding_service = EmbeddingService()

        # Initialize Pinecone
        self.pc = Pinecone(api_key=Config.PINECONE_API_KEY)

        # Connect to index
        self.index = self.pc.Index(Config.PINECONE_INDEX_NAME)

    def add_text(
        self,
        text: str,
        vector_id: str,
        metadata: dict,
        user_id: str
    ):
        embedding = self.embedding_service.embed_text(
            text,
            user_id=user_id
        )

        safe_metadata = {
            **metadata,
            "userId": str(user_id),
            "documentId": str(metadata.get("documentId"))
        }

        self.index.upsert(
            vectors=[
                {
                    "id": vector_id,
                    "values": embedding,
                    "metadata": safe_metadata
                }
            ]
        )

    def search(
        self,
        query: str,
        user_id: str,
        document_id: str,
        top_k: int = 12
    ):
        query_embedding = self.embedding_service.embed_text(
            query,
            user_id=user_id
        )

        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter={
                "userId": {"$eq": str(user_id)},
                "documentId": {"$eq": str(document_id)}
            }
        )

        formatted_results = []

        for match in results.matches:
            formatted_results.append({
                "id": match.id,
                "metadata": match.metadata,
                "score": match.score
            })

        return formatted_results