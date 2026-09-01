import logging
import os
import uuid
from datetime import datetime
from threading import Thread

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, current_app, request
from werkzeug.utils import secure_filename

import app.extensions as extensions
from app.config import Config
from app.extensions import limiter
from app.middlewares.auth_middleware import jwt_required
from app.services.document_service import DocumentService
from app.utils.responses import fail, ok
from app.utils.serializer import serialize_dict

logger = logging.getLogger(__name__)

documents_bp = Blueprint("documents", __name__)

ALLOWED_EXTENSIONS = {"pdf", "txt", "md"}
ALLOWED_MIMETYPES = {
    "application/pdf",
    "application/x-pdf",
    "text/plain",
    "text/markdown",
    "application/octet-stream",  # some browsers send this for .txt/.md
}

document_service = DocumentService()


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _require_db():
    if extensions.db is None:
        return fail(
            "The database is unavailable. Please try again shortly.",
            503,
            code="db_unavailable",
        )
    return None


def _parse_object_id(value, label="id"):
    try:
        return ObjectId(value), None
    except (InvalidId, TypeError):
        return None, fail(f"Invalid {label}", 400, code="invalid_id")


def _reject_by_content(head: bytes, filename: str):
    """Returns an error response when the bytes do not match a supported type."""
    from app.utils.file_loader import PDF_MAGIC, TEXT_BOMS

    is_pdf_name = filename.rsplit(".", 1)[-1].lower() == "pdf"
    looks_like_pdf = head.startswith(PDF_MAGIC)

    if is_pdf_name and not looks_like_pdf:
        return fail(
            "That file is not a valid PDF. Please re-export it and try again.",
            400,
            code="corrupt_pdf",
        )

    if not looks_like_pdf and not head.startswith(TEXT_BOMS) and b"\x00" in head:
        return fail(
            "That file looks like a binary, not a PDF or text document.",
            400,
            code="unsupported_type",
        )

    return None


def _shape_document(doc: dict) -> dict:
    """Single place that decides what a document looks like to the frontend."""
    data = serialize_dict(doc)
    data["documentId"] = data.pop("_id", None)
    data["filename"] = doc.get("originalFilename") or doc.get("filename")
    data["storedFilename"] = doc.get("filename")
    data.setdefault("status", "processing")
    data.setdefault("enabled", True)
    data.setdefault("totalChunks", 0)
    return data


# ----------------------------------------------------------------------
# Upload
# ----------------------------------------------------------------------
@documents_bp.route("/upload", methods=["POST"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_UPLOAD)
def upload_document():
    db_error = _require_db()
    if db_error:
        return db_error

    missing_keys = Config.missing_ai_keys()
    if missing_keys:
        return fail(
            "Document processing is not configured on this server "
            f"({', '.join(missing_keys)} missing).",
            503,
            code="ai_unavailable",
        )

    if "file" not in request.files:
        return fail("No file provided", 400, code="no_file")

    file = request.files["file"]

    if not file.filename or not file.filename.strip():
        return fail("No file selected", 400, code="no_file")

    if not allowed_file(file.filename):
        return fail(
            "Only PDF, TXT and MD files are supported", 400, code="unsupported_type"
        )

    if file.mimetype and file.mimetype not in ALLOWED_MIMETYPES:
        return fail("Unsupported file type", 400, code="unsupported_type")

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size == 0:
        return fail("The selected file is empty", 400, code="empty_file")

    if file_size > Config.MAX_CONTENT_LENGTH:
        return fail(
            f"File size exceeds the {Config.MAX_UPLOAD_MB}MB limit", 413, code="too_large"
        )

    # Check the actual bytes, not just the extension. Doing this here rather
    # than during background ingestion means a renamed binary is rejected
    # immediately instead of sitting in "processing" and then failing.
    head = file.read(1024)
    file.seek(0)
    content_error = _reject_by_content(head, file.filename)
    if content_error:
        return content_error

    # secure_filename drops non-ASCII characters, so a name like "文档.pdf"
    # collapses to "pdf" and loses its extension. Rebuild it deliberately.
    extension = file.filename.rsplit(".", 1)[-1].lower()
    stem = secure_filename(file.filename.rsplit(".", 1)[0]) or "document"
    original_filename = f"{stem}.{extension}"

    upload_folder = Config.UPLOAD_FOLDER
    os.makedirs(upload_folder, exist_ok=True)

    unique_filename = f"{uuid.uuid4()}_{original_filename}"
    file_path = os.path.join(upload_folder, unique_filename)
    file.save(file_path)

    user_id = request.user["userId"]

    document = {
        "userId": ObjectId(user_id),
        "filename": unique_filename,
        "originalFilename": original_filename,
        "path": file_path,
        "size": file_size,
        "status": "processing",
        "enabled": True,
        "totalChunks": 0,
        "createdAt": datetime.utcnow(),
    }

    doc_id = extensions.db.documents.insert_one(document).inserted_id

    app = current_app._get_current_object()
    Thread(
        target=document_service.ingest_document,
        kwargs={
            "app": app,
            "document_id": str(doc_id),
            "file_path": file_path,
            "user_id": user_id,
        },
        daemon=True,
        name=f"ingest-{doc_id}",
    ).start()

    logger.info("Queued ingestion for %s (%s bytes)", original_filename, file_size)

    return ok(
        {
            "documentId": str(doc_id),
            "filename": original_filename,
            "size": file_size,
            "status": "processing",
        },
        201,
    )


# ----------------------------------------------------------------------
# List / detail
# ----------------------------------------------------------------------
@documents_bp.route("/list", methods=["GET"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_READ)
def list_documents():
    db_error = _require_db()
    if db_error:
        return db_error

    # Clear out spinners left behind by a worker that died mid-ingestion.
    document_service.fail_stale_processing()

    user_id = request.user["userId"]

    documents = list(
        extensions.db.documents.find(
            {"userId": ObjectId(user_id)},
            {
                "_id": 1,
                "filename": 1,
                "originalFilename": 1,
                "status": 1,
                "enabled": 1,
                "size": 1,
                "totalChunks": 1,
                "error": 1,
                "createdAt": 1,
            },
        ).sort("createdAt", -1)
    )

    shaped = [_shape_document(doc) for doc in documents]

    return ok(
        {"documents": shaped, "count": len(shaped)},
        # Kept at the top level too for older frontend builds.
        documents=shaped,
        count=len(shaped),
    )


@documents_bp.route("/<document_id>", methods=["GET"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_READ)
def get_document(document_id):
    db_error = _require_db()
    if db_error:
        return db_error

    object_id, id_error = _parse_object_id(document_id, "document id")
    if id_error:
        return id_error

    document = extensions.db.documents.find_one(
        {"_id": object_id, "userId": ObjectId(request.user["userId"])}
    )
    if not document:
        return fail("Document not found", 404, code="not_found")

    document.pop("path", None)
    return ok({"document": _shape_document(document)})


# ----------------------------------------------------------------------
# Delete
# ----------------------------------------------------------------------
@documents_bp.route("/<document_id>", methods=["DELETE"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_UPLOAD)
def delete_document(document_id):
    db_error = _require_db()
    if db_error:
        return db_error

    _, id_error = _parse_object_id(document_id, "document id")
    if id_error:
        return id_error

    deleted = document_service.delete_document(document_id, request.user["userId"])
    if not deleted:
        return fail("Document not found", 404, code="not_found")

    return ok({"documentId": document_id, "deleted": True})
