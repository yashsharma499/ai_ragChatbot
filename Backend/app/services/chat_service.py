import logging
from datetime import datetime

from bson import ObjectId

import app.extensions as extensions
from app.config import Config
from app.services.embedding_service import embedding_service
from app.services.vector_service import VectorService

logger = logging.getLogger(__name__)

NO_CONTEXT_ANSWER = (
    "I could not find anything relevant to that in this document. "
    "Try rephrasing your question, or ask about a topic the document covers."
)

SYSTEM_PROMPT = (
    "You are a precise document analyst. You answer questions about a single "
    "document using only the excerpts provided to you. You never invent facts, "
    "figures, names or dates that are not in those excerpts."
)

PROMPT_TEMPLATE = """\
Answer the user's question using the document excerpts below.

Rules:
1. Base every factual claim on the excerpts. Do not use outside knowledge for
   anything about this document.
2. If the excerpts do not contain the answer, say exactly:
   "Not found in the document."
   Then, in one short sentence, suggest what the user could ask instead.
3. Cite the excerpts you used by their number, like [1] or [2, 3].
4. Use Markdown. Prefer short paragraphs and bullet lists over walls of text.
5. If the user is just greeting you or making small talk, reply briefly and
   warmly, and invite them to ask about the document. Skip the citations then.
{history_block}
Document excerpts:
{context}

Question:
{question}
"""


class ChatService:
    def __init__(self):
        self.embedding_service = embedding_service
        self.vector_service = VectorService()

    # ------------------------------------------------------------------
    def ask_question(self, question: str, user_id: str, document_id: str, top_k=None):
        if extensions.db is None:
            raise RuntimeError("Database unavailable")

        question = question.strip()
        top_k = top_k or Config.RAG_TOP_K

        matches = self.vector_service.search(
            query=question,
            user_id=user_id,
            document_id=document_id,
            top_k=top_k,
        )

        passages = self._load_passages(matches, user_id, document_id)

        if not passages:
            answer = NO_CONTEXT_ANSWER
            sources = []
        else:
            context = "\n\n".join(
                f"[{i + 1}] (chunk {p['chunkIndex']})\n{p['text']}"
                for i, p in enumerate(passages)
            )

            prompt = PROMPT_TEMPLATE.format(
                history_block=self._history_block(user_id, document_id),
                context=context,
                question=question,
            )

            answer = self.embedding_service.generate_answer(
                prompt,
                user_id=ObjectId(user_id),
                system_prompt=SYSTEM_PROMPT,
            )

            sources = [
                {
                    "index": i + 1,
                    "chunkIndex": p["chunkIndex"],
                    "score": round(p["score"], 4),
                    "excerpt": p["text"][:280],
                }
                for i, p in enumerate(passages)
            ]

        message = {
            "userId": ObjectId(user_id),
            "documentId": ObjectId(document_id),
            "question": question,
            "answer": answer,
            "sources": sources,
            "createdAt": datetime.utcnow(),
        }
        inserted = extensions.db.chat_messages.insert_one(message)

        return {
            "messageId": str(inserted.inserted_id),
            "question": question,
            "answer": answer,
            "sources": sources,
            "createdAt": message["createdAt"].isoformat() + "Z",
        }

    # ------------------------------------------------------------------
    def _load_passages(self, matches, user_id, document_id):
        """
        Fetches every matched chunk in one query and returns them in relevance
        order. The previous implementation issued one Mongo round trip per match.
        """
        if not matches:
            return []

        vector_ids = [m["id"] for m in matches if m.get("id")]
        if not vector_ids:
            return []

        rows = extensions.db.documents_chunk.find(
            {
                "vectorId": {"$in": vector_ids},
                "userId": ObjectId(user_id),
                "documentId": ObjectId(document_id),
            },
            {"_id": 0, "vectorId": 1, "text": 1, "chunkIndex": 1},
        )
        by_vector_id = {row["vectorId"]: row for row in rows}

        passages = []
        seen_text = set()
        for match in matches:
            row = by_vector_id.get(match["id"])
            if not row:
                continue
            text = (row.get("text") or "").strip()
            # Overlapping chunks can retrieve near-identical text; sending the
            # same passage twice just wastes context.
            if not text or text in seen_text:
                continue
            seen_text.add(text)
            passages.append(
                {
                    "text": text,
                    "chunkIndex": row.get("chunkIndex", 0),
                    "score": match.get("score", 0.0),
                }
            )

        return passages

    def _history_block(self, user_id, document_id):
        """
        Includes the last few turns so follow-up questions like "and what about
        the second one?" resolve correctly.
        """
        turns = Config.RAG_HISTORY_TURNS
        if turns <= 0:
            return "\n"

        recent = list(
            extensions.db.chat_messages.find(
                {"userId": ObjectId(user_id), "documentId": ObjectId(document_id)},
                {"_id": 0, "question": 1, "answer": 1},
            )
            .sort("createdAt", -1)
            .limit(turns)
        )

        if not recent:
            return "\n"

        recent.reverse()
        lines = []
        for turn in recent:
            answer = (turn.get("answer") or "")[:400]
            lines.append(f"User: {turn.get('question', '')}\nAssistant: {answer}")

        return "\nEarlier in this conversation:\n" + "\n\n".join(lines) + "\n"

    # ------------------------------------------------------------------
    def clear_history(self, user_id: str, document_id: str) -> int:
        result = extensions.db.chat_messages.delete_many(
            {"userId": ObjectId(user_id), "documentId": ObjectId(document_id)}
        )
        return result.deleted_count
