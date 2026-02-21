import app.extensions as extensions
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from datetime import datetime
from bson import ObjectId


class ChatService:
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()

    def ask_question(
        self,
        question: str,
        user_id: str,
        document_id: str,
        top_k: int = 5
    ):
        if extensions.db is None:
            raise RuntimeError("MongoDB not initialized")

        results = self.vector_service.search(
            query=question,
            user_id=user_id,
            document_id=document_id,
            top_k=top_k
        )

        if not results:
            answer = "No relevant information found for this document."
        else:
            chunk_texts = []

            for match in results:
                vector_id = match["id"]

                chunk = extensions.db.documents_chunk.find_one(
                    {
                        "vectorId": vector_id,
                        "userId": ObjectId(user_id),
                        "documentId": ObjectId(document_id)
                    },
                    {"_id": 0}
                )

                if chunk:
                    chunk_texts.append(chunk["text"])

            if not chunk_texts:
                answer = "No relevant information found for this document."
            else:
                context = "\n\n".join(chunk_texts)

                prompt = f"""
You are a smart, friendly AI assistant like ChatGPT.

Follow these rules carefully:

1. If the user's question is related to the provided document context,
   then answer strictly using only the document context.

2. If the question is about the document but the answer is not present,
   reply exactly with:
   "Not found in document"

3. If the question is not related to the document,
   answer normally using your general knowledge.

4. If the user greets or chats casually,
   reply politely and conversationally.

5. Do not make up document-related facts.

6. Keep answers clear and structured.

Document Context:
{context}

User Question:
{question}

Answer:
"""

                answer = self.embedding_service.generate_answer(
                    prompt,
                    ObjectId(user_id)
                )

        extensions.db.chat_messages.insert_one({
            "userId": ObjectId(user_id),
            "documentId": ObjectId(document_id),
            "question": question,
            "answer": answer,
            "createdAt": datetime.utcnow()
        })

        return {
            "answer": answer
        }