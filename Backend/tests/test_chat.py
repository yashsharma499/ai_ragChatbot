from datetime import datetime

import pytest
from bson import ObjectId

import app.extensions as extensions


@pytest.fixture()
def document(auth_headers, registered):
    """Inserts a fully-processed document owned by the fixture user."""
    user_id = ObjectId(registered["user"]["userId"])
    doc_id = extensions.db.documents.insert_one(
        {
            "userId": user_id,
            "filename": "uuid_report.pdf",
            "originalFilename": "report.pdf",
            "status": "processed",
            "enabled": True,
            "totalChunks": 2,
            "createdAt": datetime.utcnow(),
        }
    ).inserted_id

    extensions.db.documents_chunk.insert_many(
        [
            {
                "userId": user_id,
                "documentId": doc_id,
                "chunkIndex": 0,
                "text": "Revenue grew 40% in Q3.",
                "vectorId": f"{doc_id}_0",
            },
            {
                "userId": user_id,
                "documentId": doc_id,
                "chunkIndex": 1,
                "text": "Headcount stayed flat.",
                "vectorId": f"{doc_id}_1",
            },
        ]
    )
    return str(doc_id)


@pytest.fixture(autouse=True)
def stub_rag(monkeypatch, request):
    """Replaces Pinecone and Groq with deterministic stubs."""
    from app.routes import chat as chat_route

    def fake_search(query, user_id, document_id, top_k=None, min_score=None):
        return [
            {"id": f"{document_id}_0", "score": 0.9, "metadata": {}},
            {"id": f"{document_id}_1", "score": 0.7, "metadata": {}},
        ]

    monkeypatch.setattr(chat_route.chat_service.vector_service, "search", fake_search)
    monkeypatch.setattr(
        chat_route.chat_service.embedding_service,
        "generate_answer",
        lambda prompt, **kwargs: "Revenue grew 40% in Q3. [1]",
    )


# ----------------------------------------------------------------------
def test_ask_returns_an_answer_with_sources(client, auth_headers, document):
    response = client.post(
        "/chat/ask",
        headers=auth_headers,
        json={"documentId": document, "question": "How did revenue do?"},
    )
    assert response.status_code == 200
    data = response.get_json()["data"]

    assert data["answer"] == "Revenue grew 40% in Q3. [1]"
    assert len(data["sources"]) == 2
    assert data["sources"][0]["chunkIndex"] == 0
    assert "excerpt" in data["sources"][0]


def test_ask_persists_the_exchange(client, auth_headers, document):
    client.post(
        "/chat/ask",
        headers=auth_headers,
        json={"documentId": document, "question": "How did revenue do?"},
    )
    assert extensions.db.chat_messages.count_documents({}) == 1


def test_ask_requires_authentication(client, document):
    response = client.post(
        "/chat/ask", json={"documentId": document, "question": "hello there"}
    )
    assert response.status_code == 401


def test_ask_rejects_an_empty_question(client, auth_headers, document):
    response = client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": document, "question": "   "}
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "empty_question"


def test_ask_rejects_an_overlong_question(client, auth_headers, document):
    response = client.post(
        "/chat/ask",
        headers=auth_headers,
        json={"documentId": document, "question": "x" * 1001},
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "question_too_long"


def test_ask_requires_a_document_id(client, auth_headers):
    response = client.post("/chat/ask", headers=auth_headers, json={"question": "hello"})
    assert response.status_code == 400
    assert response.get_json()["code"] == "missing_fields"


def test_ask_rejects_a_malformed_document_id(client, auth_headers):
    response = client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": "nope", "question": "hello"}
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_id"


def test_ask_explains_that_a_document_is_still_processing(client, auth_headers, document):
    extensions.db.documents.update_one(
        {"_id": ObjectId(document)}, {"$set": {"status": "processing"}}
    )
    response = client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": document, "question": "hi there"}
    )
    assert response.status_code == 409
    assert response.get_json()["code"] == "document_processing"


def test_ask_explains_a_failed_document(client, auth_headers, document):
    extensions.db.documents.update_one(
        {"_id": ObjectId(document)},
        {"$set": {"status": "failed", "error": "This PDF is password protected."}},
    )
    response = client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": document, "question": "hi there"}
    )
    assert response.status_code == 409
    assert "password protected" in response.get_json()["message"]


def test_ask_explains_an_admin_disabled_document(client, auth_headers, document):
    extensions.db.documents.update_one(
        {"_id": ObjectId(document)}, {"$set": {"enabled": False}}
    )
    response = client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": document, "question": "hi there"}
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "document_disabled"


def test_ask_cannot_reach_another_users_document(client, auth_headers, document):
    other = client.post(
        "/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "Password123"},
    ).get_json()["data"]

    response = client.post(
        "/chat/ask",
        headers={"Authorization": f"Bearer {other['token']}"},
        json={"documentId": document, "question": "How did revenue do?"},
    )
    assert response.status_code == 404


def test_ask_says_so_when_nothing_relevant_is_found(
    client, auth_headers, document, monkeypatch
):
    from app.routes import chat as chat_route

    monkeypatch.setattr(
        chat_route.chat_service.vector_service,
        "search",
        lambda **kwargs: [],
    )
    response = client.post(
        "/chat/ask",
        headers=auth_headers,
        json={"documentId": document, "question": "What is the capital of France?"},
    )
    assert response.status_code == 200
    assert "could not find" in response.get_json()["data"]["answer"]


def test_ask_never_leaks_an_internal_exception(client, auth_headers, document, monkeypatch):
    from app.routes import chat as chat_route

    def explode(**kwargs):
        raise RuntimeError("mongodb://user:hunter2@secret-host/db is down")

    monkeypatch.setattr(chat_route.chat_service.vector_service, "search", explode)

    response = client.post(
        "/chat/ask",
        headers=auth_headers,
        json={"documentId": document, "question": "How did revenue do?"},
    )
    assert response.status_code == 500
    assert "hunter2" not in response.get_data(as_text=True)
    assert "secret-host" not in response.get_data(as_text=True)


def test_ai_outage_reports_503_not_500(client, auth_headers, document, monkeypatch):
    from app.routes import chat as chat_route
    from app.services.embedding_service import AIServiceUnavailable

    def unavailable(prompt, **kwargs):
        raise AIServiceUnavailable("The AI service is temporarily unavailable.")

    monkeypatch.setattr(
        chat_route.chat_service.embedding_service, "generate_answer", unavailable
    )
    response = client.post(
        "/chat/ask",
        headers=auth_headers,
        json={"documentId": document, "question": "How did revenue do?"},
    )
    assert response.status_code == 503
    assert response.get_json()["code"] == "ai_unavailable"


# ----------------------------------------------------------------------
def test_history_returns_messages_oldest_first(client, auth_headers, document):
    for question in ["first question", "second question"]:
        client.post(
            "/chat/ask",
            headers=auth_headers,
            json={"documentId": document, "question": question},
        )

    response = client.get(f"/chat/history?documentId={document}", headers=auth_headers)
    assert response.status_code == 200
    messages = response.get_json()["data"]["messages"]
    assert [m["question"] for m in messages] == ["first question", "second question"]


def test_history_requires_a_document_id(client, auth_headers):
    response = client.get("/chat/history", headers=auth_headers)
    assert response.status_code == 400


def test_history_can_be_cleared(client, auth_headers, document):
    client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": document, "question": "hello there"}
    )
    response = client.delete(f"/chat/history?documentId={document}", headers=auth_headers)
    assert response.status_code == 200
    assert response.get_json()["data"]["deleted"] == 1
    assert extensions.db.chat_messages.count_documents({}) == 0


def test_timestamps_are_iso_utc(client, auth_headers, document):
    client.post(
        "/chat/ask", headers=auth_headers, json={"documentId": document, "question": "hello there"}
    )
    message = client.get(
        f"/chat/history?documentId={document}", headers=auth_headers
    ).get_json()["data"]["messages"][0]

    # "2026-08-31T10:00:00Z" parses identically in every browser; the previous
    # RFC-1123 format did not.
    assert message["createdAt"].endswith("Z")
    assert "T" in message["createdAt"]
