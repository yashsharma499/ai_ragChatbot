from datetime import datetime
from bson import ObjectId
from groq import Groq
from sentence_transformers import SentenceTransformer
import app.extensions as extensions
from app.config import Config


class EmbeddingService:
    def __init__(self):
        # Local embedding model
        self.embed_model = SentenceTransformer(Config.EMBED_MODEL)

        # Groq LLM
        self.groq_client = Groq(api_key=Config.GROQ_API_KEY)
        self.chat_model = Config.GROQ_MODEL

    def embed_text(self, text: str, user_id=None):
        embedding = self.embed_model.encode(text).tolist()

        token_count = len(text.split())

        if user_id:
            extensions.db.usage_logs.insert_one({
                "userId": ObjectId(user_id),
                "type": "embedding",
                "tokens": token_count,
                "model": Config.EMBED_MODEL,
                "createdAt": datetime.utcnow()
            })

        return embedding

    def generate_answer(self, prompt: str, user_id=None):
        completion = self.groq_client.chat.completions.create(
            model=self.chat_model,
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )

        answer = completion.choices[0].message.content

        token_count = len(prompt.split()) + len(answer.split())

        if user_id:
            extensions.db.usage_logs.insert_one({
                "userId": ObjectId(user_id),
                "type": "generation",
                "tokens": token_count,
                "model": self.chat_model,
                "createdAt": datetime.utcnow()
            })

        return answer