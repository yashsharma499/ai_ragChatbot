import io

import pytest

import app.extensions as extensions
from app.config import Config


@pytest.fixture(autouse=True)
def ai_configured(monkeypatch):
    """Uploads are gated on AI config; pretend it is present."""
    monkeypatch.setattr(Config, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(Config, "PINECONE_API_KEY", "test-key")
    monkeypatch.setattr(Config, "PINECONE_INDEX_NAME", "test-index")


@pytest.fixture(autouse=True)
def no_background_ingestion(monkeypatch):
    """Keeps the ML pipeline out of route tests."""
    from app.routes import documents as documents_route

    monkeypatch.setattr(
        documents_route.document_service, "ingest_document", lambda **kwargs: None
    )


@pytest.fixture(autouse=True)
def temp_uploads(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "UPLOAD_FOLDER", str(tmp_path))


def upload(client, headers, filename="notes.txt", content=b"hello world", mimetype="text/plain"):
    return client.post(
        "/documents/upload",
        headers=headers,
        data={"file": (io.BytesIO(content), filename, mimetype)},
        content_type="multipart/form-data",
    )


# ----------------------------------------------------------------------
def test_upload_requires_authentication(client):
    assert upload(client, {}).status_code == 401


def test_upload_accepts_a_text_file(client, auth_headers):
    response = upload(client, auth_headers)
    assert response.status_code == 201
    data = response.get_json()["data"]
    assert data["status"] == "processing"
    assert data["filename"] == "notes.txt"
    assert data["size"] == len(b"hello world")


def test_upload_rejects_a_missing_file(client, auth_headers):
    response = client.post(
        "/documents/upload", headers=auth_headers, data={}, content_type="multipart/form-data"
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "no_file"


def test_upload_rejects_an_empty_file(client, auth_headers):
    response = upload(client, auth_headers, content=b"")
    assert response.status_code == 400
    assert response.get_json()["code"] == "empty_file"


def test_upload_rejects_an_unsupported_extension(client, auth_headers):
    response = upload(client, auth_headers, filename="virus.exe", mimetype="application/x-msdownload")
    assert response.status_code == 400
    assert response.get_json()["code"] == "unsupported_type"


def test_upload_rejects_an_oversized_file(client, auth_headers, monkeypatch):
    monkeypatch.setattr(Config, "MAX_CONTENT_LENGTH", 10)
    response = upload(client, auth_headers, content=b"x" * 50)
    assert response.status_code == 413
    assert response.get_json()["code"] == "too_large"


def test_upload_survives_a_non_ascii_filename(client, auth_headers):
    """secure_filename strips these to nothing, which used to yield 'uuid_'."""
    response = upload(client, auth_headers, filename="文档.txt")
    assert response.status_code == 201
    assert response.get_json()["data"]["filename"].endswith(".txt")


def test_upload_returns_503_when_ai_is_unconfigured(client, auth_headers, monkeypatch):
    monkeypatch.setattr(Config, "GROQ_API_KEY", None)
    response = upload(client, auth_headers)
    assert response.status_code == 503
    assert response.get_json()["code"] == "ai_unavailable"


# ----------------------------------------------------------------------
def test_list_shows_the_original_filename_not_the_uuid(client, auth_headers):
    upload(client, auth_headers, filename="quarterly-report.txt")

    response = client.get("/documents/list", headers=auth_headers)
    assert response.status_code == 200
    documents = response.get_json()["data"]["documents"]

    assert len(documents) == 1
    assert documents[0]["filename"] == "quarterly-report.txt"
    assert "documentId" in documents[0]
    assert documents[0]["status"] == "processing"


def test_list_only_shows_your_own_documents(client, auth_headers):
    upload(client, auth_headers, filename="mine.txt")

    other = client.post(
        "/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "Password123"},
    ).get_json()["data"]
    other_headers = {"Authorization": f"Bearer {other['token']}"}

    response = client.get("/documents/list", headers=other_headers)
    assert response.get_json()["data"]["documents"] == []


def test_get_document_rejects_a_malformed_id(client, auth_headers):
    response = client.get("/documents/not-an-object-id", headers=auth_headers)
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_id"


def test_get_document_404s_for_someone_elses_document(client, auth_headers):
    document_id = upload(client, auth_headers).get_json()["data"]["documentId"]

    other = client.post(
        "/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "Password123"},
    ).get_json()["data"]

    response = client.get(
        f"/documents/{document_id}",
        headers={"Authorization": f"Bearer {other['token']}"},
    )
    assert response.status_code == 404


def test_get_document_never_leaks_the_server_path(client, auth_headers):
    document_id = upload(client, auth_headers).get_json()["data"]["documentId"]
    response = client.get(f"/documents/{document_id}", headers=auth_headers)
    assert "path" not in response.get_json()["data"]["document"]


# ----------------------------------------------------------------------
def test_delete_removes_the_document_and_its_chat_history(client, auth_headers, monkeypatch):
    from app.routes import documents as documents_route
    from bson import ObjectId

    document_id = upload(client, auth_headers).get_json()["data"]["documentId"]

    extensions.db.chat_messages.insert_one(
        {
            "userId": extensions.db.documents.find_one({})["userId"],
            "documentId": ObjectId(document_id),
            "question": "hi",
            "answer": "hello",
        }
    )
    extensions.db.documents_chunk.insert_one(
        {"documentId": ObjectId(document_id), "vectorId": f"{document_id}_0", "text": "x"}
    )

    monkeypatch.setattr(
        documents_route.document_service.vector_service,
        "delete_document",
        lambda ids: len(ids),
    )

    response = client.delete(f"/documents/{document_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.get_json()["data"]["deleted"] is True

    assert extensions.db.documents.count_documents({}) == 0
    assert extensions.db.documents_chunk.count_documents({}) == 0
    assert extensions.db.chat_messages.count_documents({}) == 0


def test_delete_404s_for_someone_elses_document(client, auth_headers):
    document_id = upload(client, auth_headers).get_json()["data"]["documentId"]

    other = client.post(
        "/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "Password123"},
    ).get_json()["data"]

    response = client.delete(
        f"/documents/{document_id}",
        headers={"Authorization": f"Bearer {other['token']}"},
    )
    assert response.status_code == 404
    assert extensions.db.documents.count_documents({}) == 1


# ----------------------------------------------------------------------
# Content sniffing at upload time
# ----------------------------------------------------------------------
def test_binary_disguised_as_text_is_rejected_immediately(client, auth_headers):
    """
    Previously this returned 201 and only failed later during background
    ingestion, leaving the user watching a spinner that ended in an error.
    """
    response = upload(
        client, auth_headers, filename="sneaky.txt", content=b"MZ\x00\x00\x90binary"
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "unsupported_type"


def test_a_pdf_that_is_not_a_pdf_is_rejected(client, auth_headers):
    response = upload(
        client,
        auth_headers,
        filename="fake.pdf",
        content=b"this is plainly not a pdf",
        mimetype="application/pdf",
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "corrupt_pdf"


def test_a_real_pdf_header_is_accepted(client, auth_headers):
    response = upload(
        client,
        auth_headers,
        filename="real.pdf",
        content=b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\ntrailer<<>>",
        mimetype="application/pdf",
    )
    assert response.status_code == 201


def test_utf16_text_is_not_mistaken_for_a_binary(client, auth_headers):
    response = upload(
        client,
        auth_headers,
        filename="notes.txt",
        content="hello world".encode("utf-16"),
    )
    assert response.status_code == 201
