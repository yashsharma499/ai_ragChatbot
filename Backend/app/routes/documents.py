import os
import uuid
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from bson import ObjectId

from app.services.document_service import DocumentService
from app.middlewares.auth_middleware import jwt_required
import app.extensions as extensions
from app.extensions import limiter
from app.utils.serializer import serialize_dict
from threading import Thread
from datetime import datetime


documents_bp = Blueprint("documents", __name__)

UPLOAD_FOLDER = "uploads/documents"
ALLOWED_EXTENSIONS = {"pdf", "txt"}

document_service = DocumentService()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@documents_bp.route("/upload", methods=["POST"])
@jwt_required()
@limiter.limit("2 per minute")
def upload_document():
    print("\nUpload request received")
    file_path = None

    if "file" not in request.files:
        return jsonify({"message": "No file provided", "success": False}), 400

    file = request.files["file"]

    MAX_FILE_SIZE = 5 * 1024 * 1024

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > MAX_FILE_SIZE:
        return jsonify({"success": False, "message": "File size exceeds 5MB limit"}), 413

    if file.filename == "":
        return jsonify({"success": False, "message": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"success": False, "message": "Only PDF and TXT allowed"}), 400

    allowed_mimetypes = {
        "application/pdf",
        "text/plain"
    }

    if file.mimetype not in allowed_mimetypes:
        return jsonify({"success": False, "message": "Invalid file type"}), 400

    file.seek(0, os.SEEK_END)
    if file.tell() == 0:
        return jsonify({"success": False, "message": "Uploaded file is empty"}), 400
    file.seek(0)

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    original_filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}_{original_filename}"

    file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
    file.save(file_path)

    user_id = request.user["userId"]

    document = {
        "userId": ObjectId(user_id),
        "filename": unique_filename,
        "originalFilename": original_filename,
        "path": file_path,
        "status": "processing",
        "enabled": True,
        "createdAt": datetime.utcnow()
    }

    doc_id = extensions.db.documents.insert_one(document).inserted_id

    # 🔥 PASS REAL FLASK APP INTO THREAD
    app = current_app._get_current_object()

    Thread(
        target=document_service.ingest_document,
        kwargs={
            "app": app,
            "document_id": str(doc_id),
            "file_path": file_path,
            "user_id": user_id
        },
        daemon=True
    ).start()

    print(f"File saved at {file_path}")

    return jsonify({
        "success": True,
        "data": {
            "documentId": str(doc_id),
            "status": "processing"
        }
    }), 201


@documents_bp.route("/list", methods=["GET"])
@jwt_required()
@limiter.limit("30 per minute")
def list_documents():
    user_id = request.user["userId"]

    if extensions.db is None:
        return jsonify({
            "success": False,
            "message": "DB not initialized"
        }), 500

    documents = list(
        extensions.db.documents.find(
            {"userId": ObjectId(user_id)},
            {
                "_id": 1,
                "filename": 1,
                "status": 1,
                "enabled": 1,
                "createdAt": 1
            }
        ).sort("createdAt", -1)
    )

    documents = [serialize_dict(doc) for doc in documents]

    for doc in documents:
        doc["documentId"] = doc.pop("_id")

    return jsonify({
        "success": True,
        "data": documents,
        "documents": documents,
        "count": len(documents)
    }), 200