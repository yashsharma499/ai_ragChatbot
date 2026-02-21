import os
from datetime import datetime
from bson import ObjectId

import app.extensions as extensions
from app.utils.file_loader import load_text_from_file
from app.utils.text_chunker import chunk_text
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService


class DocumentService:
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()

    # 👇 IMPORTANT: accept app as first argument
    def ingest_document(self, app, document_id: str, file_path: str, user_id: str):

        # 👇 use real app context
        with app.app_context():

            print("\nStarting document ingestion")

            if not os.path.exists(file_path):
                raise FileNotFoundError("Document file does not exist")

            filename = os.path.basename(file_path)
            doc_object_id = ObjectId(document_id)

            documents_collection = extensions.db.documents
            chunks_collection = extensions.db.documents_chunk

            text = load_text_from_file(file_path)

            if not text.strip():
                raise ValueError("Empty document text")

            print(f"Extracted text length: {len(text)} characters")

            chunks = chunk_text(text)
            print(f"Created {len(chunks)} chunks")

            for index, chunk_text_data in enumerate(chunks):
                chunk_id = f"{document_id}_{index}"

                chunks_collection.insert_one({
                    "userId": ObjectId(user_id),
                    "documentId": doc_object_id,
                    "chunkIndex": index,
                    "text": chunk_text_data,
                    "vectorId": chunk_id,
                    "createdAt": datetime.utcnow()
                })

                self.vector_service.add_text(
                    text=chunk_text_data,
                    vector_id=chunk_id,
                    user_id=user_id,
                    metadata={
                        "documentId": str(document_id),
                        "chunkIndex": index,
                        "filename": filename
                    }
                )

                if (index + 1) % 5 == 0 or index == len(chunks) - 1:
                    print(f"Processed {index + 1}/{len(chunks)} chunks")

            result = documents_collection.update_one(
                {"_id": doc_object_id},
                {
                    "$set": {
                        "status": "processed",
                        "totalChunks": len(chunks)
                    }
                }
            )

            print("Modified count:", result.modified_count)
            print("Document ingestion completed\n")

            return {
                "documentId": str(document_id),
                "filename": filename,
                "totalChunks": len(chunks),
                "status": "processed"
            }