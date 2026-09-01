import logging
import os
from datetime import datetime

from bson import ObjectId

import app.extensions as extensions
from app.services.embedding_service import embedding_service
from app.services.vector_service import VectorService
from app.utils.file_loader import UnsupportedFileError, load_text_from_file
from app.utils.text_chunker import chunk_text

logger = logging.getLogger(__name__)

STATUS_PROCESSING = "processing"
STATUS_PROCESSED = "processed"
STATUS_FAILED = "failed"


class DocumentService:
    def __init__(self):
        self.embedding_service = embedding_service
        self.vector_service = VectorService()

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------
    def ingest_document(self, app, document_id: str, file_path: str, user_id: str):
        """
        Extracts, chunks, embeds and indexes a document.

        Runs on a background thread, so every failure path must be caught and
        written back to the document row. Previously an exception here vanished
        with the thread and left the document stuck on "processing" forever.
        """
        with app.app_context():
            doc_object_id = ObjectId(document_id)

            try:
                result = self._ingest(document_id, doc_object_id, file_path, user_id)
                logger.info(
                    "Ingested document %s (%s chunks)", document_id, result["totalChunks"]
                )
                return result

            except UnsupportedFileError as e:
                self._mark_failed(doc_object_id, str(e))
            except FileNotFoundError:
                self._mark_failed(doc_object_id, "The uploaded file could not be found.")
            except Exception as e:
                logger.exception("Ingestion failed for document %s", document_id)
                self._mark_failed(
                    doc_object_id,
                    "Processing failed. Please try uploading the document again.",
                )
                logger.error("Underlying ingestion error: %s", e)

            return None

    def _ingest(self, document_id, doc_object_id, file_path, user_id):
        if extensions.db is None:
            raise RuntimeError("Database unavailable")

        filename = os.path.basename(file_path)
        documents = extensions.db.documents
        chunks_collection = extensions.db.documents_chunk

        text = load_text_from_file(file_path)
        if not text.strip():
            raise UnsupportedFileError("The document contains no readable text.")

        chunks = chunk_text(text)
        if not chunks:
            raise UnsupportedFileError("The document contains no readable text.")

        logger.info(
            "Document %s: %s characters -> %s chunks", document_id, len(text), len(chunks)
        )

        # Re-ingesting the same document should not leave orphaned rows behind.
        chunks_collection.delete_many({"documentId": doc_object_id})

        now = datetime.utcnow()
        vector_ids = [f"{document_id}_{i}" for i in range(len(chunks))]

        chunks_collection.insert_many(
            [
                {
                    "userId": ObjectId(user_id),
                    "documentId": doc_object_id,
                    "chunkIndex": index,
                    "text": chunk,
                    "vectorId": vector_ids[index],
                    "createdAt": now,
                }
                for index, chunk in enumerate(chunks)
            ]
        )

        written = self.vector_service.add_texts(
            texts=chunks,
            vector_ids=vector_ids,
            user_id=user_id,
            document_id=document_id,
            filename=filename,
        )

        documents.update_one(
            {"_id": doc_object_id},
            {
                "$set": {
                    "status": STATUS_PROCESSED,
                    "totalChunks": len(chunks),
                    "characterCount": len(text),
                    "processedAt": datetime.utcnow(),
                },
                "$unset": {"error": ""},
            },
        )

        return {
            "documentId": str(document_id),
            "filename": filename,
            "totalChunks": len(chunks),
            "vectorsWritten": written,
            "status": STATUS_PROCESSED,
        }

    @staticmethod
    def _mark_failed(doc_object_id, message: str):
        if extensions.db is None:
            return
        try:
            extensions.db.documents.update_one(
                {"_id": doc_object_id},
                {"$set": {"status": STATUS_FAILED, "error": message,
                          "processedAt": datetime.utcnow()}},
            )
        except Exception:
            logger.exception("Could not record ingestion failure for %s", doc_object_id)

    # ------------------------------------------------------------------
    # Deletion
    # ------------------------------------------------------------------
    def delete_document(self, document_id: str, user_id: str) -> bool:
        """
        Removes a document and everything derived from it: the stored file, its
        chunks, its vectors and its chat history. Returns False if the document
        does not belong to the user.
        """
        doc_object_id = ObjectId(document_id)
        user_object_id = ObjectId(user_id)

        document = extensions.db.documents.find_one(
            {"_id": doc_object_id, "userId": user_object_id}
        )
        if not document:
            return False

        vector_ids = [
            c["vectorId"]
            for c in extensions.db.documents_chunk.find(
                {"documentId": doc_object_id}, {"vectorId": 1, "_id": 0}
            )
            if c.get("vectorId")
        ]

        if vector_ids:
            try:
                self.vector_service.delete_document(vector_ids)
            except Exception:
                # A stale vector is far less bad than a delete the user cannot complete.
                logger.exception("Failed to delete vectors for document %s", document_id)

        extensions.db.documents_chunk.delete_many({"documentId": doc_object_id})
        extensions.db.chat_messages.delete_many(
            {"documentId": doc_object_id, "userId": user_object_id}
        )
        extensions.db.documents.delete_one({"_id": doc_object_id})

        path = document.get("path")
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                logger.warning("Could not remove file %s", path)

        return True

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------
    @staticmethod
    def fail_stale_processing(max_age_minutes: int = 15) -> int:
        """
        Marks documents left mid-ingestion by a crashed or restarted worker as
        failed, so the UI stops showing a spinner that will never resolve.
        """
        if extensions.db is None:
            return 0

        from datetime import timedelta

        cutoff = datetime.utcnow() - timedelta(minutes=max_age_minutes)
        result = extensions.db.documents.update_many(
            {"status": STATUS_PROCESSING, "createdAt": {"$lt": cutoff}},
            {
                "$set": {
                    "status": STATUS_FAILED,
                    "error": "Processing was interrupted. Please upload the document again.",
                }
            },
        )
        if result.modified_count:
            logger.info("Marked %s stale documents as failed", result.modified_count)
        return result.modified_count
