"""
The frontend reads `body.success` and `body.message` on every failure path.
These tests pin that contract, including for errors Flask raises itself.
"""

import pytest

from app.config import Config
from app.utils.file_loader import UnsupportedFileError, load_text_from_file


def test_health_reports_missing_ai_config_as_degraded(client, monkeypatch):
    monkeypatch.setattr(Config, "GROQ_API_KEY", None)
    monkeypatch.setattr(Config, "PINECONE_API_KEY", None)
    monkeypatch.setattr(Config, "PINECONE_INDEX_NAME", None)

    response = client.get("/health")
    body = response.get_json()

    assert response.status_code == 503
    assert body["status"] == "degraded"
    assert body["database"] == "connected"
    assert set(body["missingConfig"]) == {
        "GROQ_API_KEY",
        "PINECONE_API_KEY",
        "PINECONE_INDEX_NAME",
    }


def test_health_is_ok_when_everything_is_configured(client, monkeypatch):
    monkeypatch.setattr(Config, "GROQ_API_KEY", "k")
    monkeypatch.setattr(Config, "PINECONE_API_KEY", "k")
    monkeypatch.setattr(Config, "PINECONE_INDEX_NAME", "i")

    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_unknown_endpoint_returns_json_not_html(client):
    response = client.get("/does/not/exist")
    assert response.status_code == 404
    assert response.content_type.startswith("application/json")
    body = response.get_json()
    assert body["success"] is False
    assert "No such endpoint" in body["message"]


def test_wrong_method_returns_json(client):
    response = client.get("/auth/login")
    assert response.status_code == 405
    body = response.get_json()
    assert body["success"] is False
    assert body["code"] == "method_not_allowed"


def test_non_json_body_is_rejected_cleanly(client):
    response = client.post("/auth/login", data="not json", content_type="text/plain")
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_oversized_body_returns_a_helpful_413(client, auth_headers, monkeypatch):
    """Werkzeug aborts before the view runs; the handler must still answer JSON."""
    client.application.config["MAX_CONTENT_LENGTH"] = 100

    response = client.post(
        "/documents/upload",
        headers=auth_headers,
        data={"file": (__import__("io").BytesIO(b"x" * 5000), "big.txt", "text/plain")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 413
    assert response.get_json()["success"] is False


@pytest.mark.parametrize(
    "path",
    ["/auth/me", "/documents/list", "/chat/history", "/admin/stats"],
)
def test_every_protected_route_answers_json_when_unauthenticated(client, path):
    response = client.get(path)
    assert response.status_code == 401
    body = response.get_json()
    assert body["success"] is False
    assert isinstance(body["message"], str) and body["message"]


# ----------------------------------------------------------------------
# File loading
# ----------------------------------------------------------------------
def test_text_file_loads(tmp_path):
    path = tmp_path / "notes.txt"
    path.write_text("hello world", encoding="utf-8")
    assert load_text_from_file(str(path)) == "hello world"


def test_utf16_text_file_loads(tmp_path):
    path = tmp_path / "notes.txt"
    path.write_text("hello world", encoding="utf-16")
    assert "hello world" in load_text_from_file(str(path))


def test_binary_file_is_rejected_even_with_a_txt_extension(tmp_path):
    path = tmp_path / "sneaky.txt"
    path.write_bytes(b"MZ\x00\x00\x90binary payload")

    with pytest.raises(UnsupportedFileError):
        load_text_from_file(str(path))


def test_missing_file_raises_file_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_text_from_file(str(tmp_path / "nope.txt"))


# ----------------------------------------------------------------------
# Serializer
# ----------------------------------------------------------------------
def test_serializer_handles_nested_object_ids_and_dates():
    from datetime import datetime

    from bson import ObjectId

    from app.utils.serializer import serialize_dict

    oid = ObjectId()
    result = serialize_dict(
        {
            "_id": oid,
            "createdAt": datetime(2026, 1, 2, 3, 4, 5),
            "sources": [{"chunk": 1, "ref": oid}],
            "nested": {"owner": oid},
            "keep": None,
        }
    )

    assert result["_id"] == str(oid)
    assert result["createdAt"] == "2026-01-02T03:04:05Z"
    assert result["sources"][0]["ref"] == str(oid)
    assert result["nested"]["owner"] == str(oid)
    assert result["keep"] is None
