from datetime import datetime, timedelta

import pytest
from bson import ObjectId

import app.extensions as extensions

ADMIN_ENDPOINTS = [
    ("GET", "/admin/stats"),
    ("GET", "/admin/users"),
    ("GET", "/admin/documents"),
    ("GET", "/admin/queries"),
    ("GET", "/admin/usage"),
]


@pytest.fixture()
def seeded(registered):
    """A user with two documents, three queries and some usage."""
    user_id = ObjectId(registered["user"]["userId"])
    now = datetime.utcnow()

    doc_ids = extensions.db.documents.insert_many(
        [
            {
                "userId": user_id,
                "filename": "uuid_alpha.pdf",
                "originalFilename": "alpha.pdf",
                "status": "processed",
                "enabled": True,
                "size": 1024,
                "createdAt": now,
            },
            {
                "userId": user_id,
                "filename": "uuid_beta.txt",
                "originalFilename": "beta.txt",
                "status": "failed",
                "enabled": False,
                "size": 512,
                "error": "No selectable text found",
                "createdAt": now - timedelta(days=1),
            },
        ]
    ).inserted_ids

    extensions.db.chat_messages.insert_many(
        [
            {
                "userId": user_id,
                "documentId": doc_ids[0],
                "question": f"question {i}",
                "answer": f"answer {i}",
                "createdAt": now - timedelta(minutes=i),
            }
            for i in range(3)
        ]
    )

    extensions.db.usage_logs.insert_many(
        [
            {"userId": user_id, "type": "embedding", "tokens": 100, "createdAt": now},
            {"userId": user_id, "type": "generation", "tokens": 250, "createdAt": now},
        ]
    )

    return {"userId": user_id, "docIds": doc_ids}


# ----------------------------------------------------------------------
# Authorization
# ----------------------------------------------------------------------
@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoints_reject_anonymous_callers(client, method, path):
    assert client.open(path, method=method).status_code == 401


@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoints_reject_normal_users(client, auth_headers, method, path):
    response = client.open(path, method=method, headers=auth_headers)
    assert response.status_code == 403
    assert response.get_json()["code"] == "forbidden"


def test_toggle_rejects_normal_users(client, auth_headers, seeded):
    response = client.patch(
        f"/admin/documents/{seeded['docIds'][0]}/toggle", headers=auth_headers
    )
    assert response.status_code == 403


# ----------------------------------------------------------------------
# Stats
# ----------------------------------------------------------------------
def test_stats_reports_real_numbers(client, admin_headers, seeded):
    response = client.get("/admin/stats", headers=admin_headers)
    assert response.status_code == 200
    stats = response.get_json()["data"]["stats"]

    assert stats["totalUsers"] == 2  # the seeded user plus the admin
    assert stats["totalDocuments"] == 2
    assert stats["activeDocuments"] == 1
    assert stats["failedDocuments"] == 1
    assert stats["totalQueries"] == 3
    assert stats["queriesToday"] == 3
    assert stats["totalTokens"] == 350
    # Previously the dashboard hardcoded "+12% vs last week".
    assert "userGrowthPercent" in stats


def test_stats_work_on_an_empty_database(client, admin_headers):
    stats = client.get("/admin/stats", headers=admin_headers).get_json()["data"]["stats"]
    assert stats["totalDocuments"] == 0
    assert stats["totalTokens"] == 0
    assert stats["userGrowthPercent"] == 100  # one admin registered this week


# ----------------------------------------------------------------------
# Users
# ----------------------------------------------------------------------
def test_users_include_activity_counts(client, admin_headers, seeded):
    users = client.get("/admin/users", headers=admin_headers).get_json()["data"]["users"]
    ada = next(u for u in users if u["email"] == "ada@example.com")

    assert ada["documentCount"] == 2
    assert ada["queryCount"] == 3
    assert ada["role"] == "user"
    assert "password" not in ada


def test_users_can_be_searched(client, admin_headers, seeded):
    users = client.get("/admin/users?search=ada", headers=admin_headers).get_json()["data"][
        "users"
    ]
    assert [u["email"] for u in users] == ["ada@example.com"]


def test_user_documents_expose_the_display_name(client, admin_headers, seeded):
    response = client.get(
        f"/admin/users/{seeded['userId']}/documents", headers=admin_headers
    )
    documents = response.get_json()["data"]["documents"]
    assert {d["displayName"] for d in documents} == {"alpha.pdf", "beta.txt"}


def test_user_documents_404_for_an_unknown_user(client, admin_headers):
    response = client.get(
        f"/admin/users/{ObjectId()}/documents", headers=admin_headers
    )
    assert response.status_code == 404


def test_user_documents_reject_a_malformed_id(client, admin_headers):
    response = client.get("/admin/users/nope/documents", headers=admin_headers)
    assert response.status_code == 400


def test_user_queries_are_paginated(client, admin_headers, seeded):
    response = client.get(
        f"/admin/users/{seeded['userId']}/queries?limit=2&page=1", headers=admin_headers
    )
    data = response.get_json()["data"]
    assert len(data["queries"]) == 2
    assert data["pagination"]["total"] == 3


# ----------------------------------------------------------------------
# Documents
# ----------------------------------------------------------------------
def test_documents_list_joins_the_owner_email(client, admin_headers, seeded):
    documents = client.get("/admin/documents", headers=admin_headers).get_json()["data"][
        "documents"
    ]
    assert len(documents) == 2
    assert all(d["userEmail"] == "ada@example.com" for d in documents)
    # Shows the human filename, not the uuid-prefixed stored name.
    assert {d["filename"] for d in documents} == {"alpha.pdf", "beta.txt"}


def test_documents_list_reports_a_total_for_pagination(client, admin_headers, seeded):
    data = client.get("/admin/documents?limit=1", headers=admin_headers).get_json()["data"]
    assert len(data["documents"]) == 1
    assert data["pagination"]["total"] == 2


def test_documents_can_be_filtered_by_status(client, admin_headers, seeded):
    data = client.get("/admin/documents?status=failed", headers=admin_headers).get_json()[
        "data"
    ]
    assert len(data["documents"]) == 1
    assert data["documents"][0]["status"] == "failed"


def test_page_size_is_capped(client, admin_headers, seeded):
    data = client.get("/admin/documents?limit=99999", headers=admin_headers).get_json()[
        "data"
    ]
    assert data["pagination"]["limit"] == 100


def test_nonsense_pagination_falls_back_to_defaults(client, admin_headers, seeded):
    data = client.get(
        "/admin/documents?page=abc&limit=xyz", headers=admin_headers
    ).get_json()["data"]
    assert data["pagination"] == {"page": 1, "limit": 20, "total": 2}


def test_toggle_flips_enabled_state(client, admin_headers, seeded):
    doc_id = seeded["docIds"][0]

    first = client.patch(f"/admin/documents/{doc_id}/toggle", headers=admin_headers)
    assert first.get_json()["data"]["enabled"] is False

    second = client.patch(f"/admin/documents/{doc_id}/toggle", headers=admin_headers)
    assert second.get_json()["data"]["enabled"] is True


def test_toggle_404s_for_an_unknown_document(client, admin_headers):
    response = client.patch(f"/admin/documents/{ObjectId()}/toggle", headers=admin_headers)
    assert response.status_code == 404


def test_toggle_rejects_a_malformed_id(client, admin_headers):
    response = client.patch("/admin/documents/nope/toggle", headers=admin_headers)
    assert response.status_code == 400


# ----------------------------------------------------------------------
# Queries and usage
# ----------------------------------------------------------------------
def test_queries_are_newest_first_with_the_owner_email(client, admin_headers, seeded):
    queries = client.get("/admin/queries", headers=admin_headers).get_json()["data"][
        "queries"
    ]
    assert len(queries) == 3
    assert queries[0]["question"] == "question 0"
    assert queries[0]["userEmail"] == "ada@example.com"


def test_queries_can_be_searched(client, admin_headers, seeded):
    data = client.get("/admin/queries?search=question 1", headers=admin_headers).get_json()[
        "data"
    ]
    assert data["pagination"]["total"] == 1


def test_usage_reports_an_email_not_an_id(client, admin_headers, seeded):
    """The old pipeline grouped by email and never emitted a `userEmail` field."""
    data = client.get("/admin/usage", headers=admin_headers).get_json()["data"]

    assert data["totalTokens"] == 350
    row = data["usage"][0]
    assert row["userEmail"] == "ada@example.com"
    assert row["tokens"] == 350
    assert row["embeddingTokens"] == 100
    assert row["generationTokens"] == 250


def test_usage_is_empty_when_nothing_has_been_used(client, admin_headers):
    data = client.get("/admin/usage", headers=admin_headers).get_json()["data"]
    assert data["usage"] == []
    assert data["totalTokens"] == 0
