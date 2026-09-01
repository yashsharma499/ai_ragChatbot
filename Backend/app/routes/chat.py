import logging

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, request

import app.extensions as extensions
from app.config import Config
from app.extensions import limiter
from app.middlewares.auth_middleware import jwt_required
from app.services.chat_service import ChatService
from app.services.embedding_service import AIServiceUnavailable
from app.utils.responses import fail, ok
from app.utils.serializer import serialize_dict

logger = logging.getLogger(__name__)

chat_bp = Blueprint("chat", __name__)
chat_service = ChatService()

MIN_QUESTION_LENGTH = 2
MAX_QUESTION_LENGTH = 1000


def _require_db():
    if extensions.db is None:
        return fail(
            "The database is unavailable. Please try again shortly.",
            503,
            code="db_unavailable",
        )
    return None


def _load_document(document_id, user_id):
    """
    Resolves a document the caller is allowed to chat with, or returns the
    error response explaining why they cannot.
    """
    try:
        document_object_id = ObjectId(document_id)
    except (InvalidId, TypeError):
        return None, fail("Invalid document id", 400, code="invalid_id")

    document = extensions.db.documents.find_one(
        {"_id": document_object_id, "userId": ObjectId(user_id)}
    )

    if not document:
        return None, fail("Document not found", 404, code="not_found")

    # Distinct messages for distinct situations, rather than one blanket 404.
    if document.get("enabled") is False:
        return None, fail(
            "This document has been disabled by an administrator.",
            403,
            code="document_disabled",
        )

    status = document.get("status")
    if status == "processing":
        return None, fail(
            "This document is still being processed. Please wait a moment.",
            409,
            code="document_processing",
        )
    if status == "failed":
        return None, fail(
            document.get("error") or "This document could not be processed.",
            409,
            code="document_failed",
        )

    return document, None


# ----------------------------------------------------------------------
@chat_bp.route("/ask", methods=["POST"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_CHAT)
def ask_question():
    db_error = _require_db()
    if db_error:
        return db_error

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return fail("Request body must be a JSON object", 400, code="invalid_body")

    question = data.get("question")
    document_id = data.get("documentId")

    if not document_id:
        return fail("documentId is required", 400, code="missing_fields")

    if not isinstance(question, str) or not question.strip():
        return fail("Please enter a question", 400, code="empty_question")

    question = question.strip()

    if len(question) < MIN_QUESTION_LENGTH:
        return fail("That question is too short", 400, code="question_too_short")

    if len(question) > MAX_QUESTION_LENGTH:
        return fail(
            f"That question is too long (max {MAX_QUESTION_LENGTH} characters)",
            400,
            code="question_too_long",
        )

    user_id = request.user["userId"]

    document, doc_error = _load_document(document_id, user_id)
    if doc_error:
        return doc_error

    try:
        result = chat_service.ask_question(
            question=question, user_id=user_id, document_id=document_id
        )
    except AIServiceUnavailable as e:
        return fail(str(e), 503, code="ai_unavailable")
    except Exception:
        # Never surface an internal exception string to the browser.
        logger.exception("Chat request failed for document %s", document_id)
        return fail(
            "Something went wrong generating that answer. Please try again.",
            500,
            code="chat_failed",
        )

    return ok(result)


# ----------------------------------------------------------------------
@chat_bp.route("/history", methods=["GET"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_READ)
def chat_history():
    db_error = _require_db()
    if db_error:
        return db_error

    user_id = request.user["userId"]
    document_id = request.args.get("documentId")

    if not document_id:
        return fail("documentId query parameter is required", 400, code="missing_fields")

    try:
        document_object_id = ObjectId(document_id)
    except (InvalidId, TypeError):
        return fail("Invalid document id", 400, code="invalid_id")

    messages = list(
        extensions.db.chat_messages.find(
            {"userId": ObjectId(user_id), "documentId": document_object_id}
        ).sort("createdAt", 1)
    )

    serialized = [serialize_dict(msg) for msg in messages]

    return ok(
        {"messages": serialized, "count": len(serialized)},
        messages=serialized,
        count=len(serialized),
    )


# ----------------------------------------------------------------------
@chat_bp.route("/history", methods=["DELETE"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_CHAT)
def clear_chat_history():
    db_error = _require_db()
    if db_error:
        return db_error

    document_id = request.args.get("documentId")
    if not document_id:
        return fail("documentId query parameter is required", 400, code="missing_fields")

    try:
        ObjectId(document_id)
    except (InvalidId, TypeError):
        return fail("Invalid document id", 400, code="invalid_id")

    deleted = chat_service.clear_history(request.user["userId"], document_id)
    return ok({"deleted": deleted})
