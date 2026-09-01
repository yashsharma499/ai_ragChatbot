import logging
import re
from datetime import datetime, timedelta

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, request

import app.extensions as extensions
from app.config import Config
from app.extensions import limiter
from app.middlewares.auth_middleware import jwt_required
from app.utils.responses import fail, ok
from app.utils.serializer import serialize_dict

logger = logging.getLogger(__name__)

admin_bp = Blueprint("admin", __name__)

MAX_PAGE_SIZE = 100


def _require_db():
    if extensions.db is None:
        return fail(
            "The database is unavailable. Please try again shortly.",
            503,
            code="db_unavailable",
        )
    return None


def _pagination():
    """Clamps page/limit so a hand-crafted request cannot ask for everything."""
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(request.args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20

    limit = max(1, min(limit, MAX_PAGE_SIZE))
    return page, limit, (page - 1) * limit


def _search_regex(field_or_fields):
    """Builds a case-insensitive `$or` match for the `search` query parameter."""
    term = (request.args.get("search") or "").strip()
    if not term:
        return None

    pattern = re.escape(term)
    fields = (
        [field_or_fields] if isinstance(field_or_fields, str) else list(field_or_fields)
    )
    return {"$or": [{f: {"$regex": pattern, "$options": "i"}} for f in fields]}


def _display_name(doc):
    return doc.get("originalFilename") or doc.get("filename")


# ----------------------------------------------------------------------
# Users
# ----------------------------------------------------------------------
@admin_bp.route("/users", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def get_all_users():
    db_error = _require_db()
    if db_error:
        return db_error

    try:
        pipeline = [
            {
                "$lookup": {
                    "from": "documents",
                    "localField": "_id",
                    "foreignField": "userId",
                    "as": "documents",
                }
            },
            {
                "$lookup": {
                    "from": "chat_messages",
                    "localField": "_id",
                    "foreignField": "userId",
                    "as": "queries",
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "name": {"$ifNull": ["$name", ""]},
                    "email": 1,
                    "role": {"$ifNull": ["$role", "user"]},
                    "createdAt": 1,
                    "lastLogin": 1,
                    "documentCount": {"$size": "$documents"},
                    "queryCount": {"$size": "$queries"},
                }
            },
            {"$sort": {"createdAt": -1}},
        ]

        search = _search_regex(["email", "name"])
        if search:
            pipeline.insert(0, {"$match": search})

        users = [serialize_dict(u) for u in extensions.db.users.aggregate(pipeline)]

        return ok({"users": users, "count": len(users)})

    except Exception:
        logger.exception("Failed to fetch users")
        return fail("Failed to fetch users", 500, code="query_failed")


@admin_bp.route("/users/<user_id>/documents", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def get_user_documents(user_id):
    db_error = _require_db()
    if db_error:
        return db_error

    if not ObjectId.is_valid(user_id):
        return fail("Invalid user id", 400, code="invalid_id")

    user_object_id = ObjectId(user_id)
    user = extensions.db.users.find_one({"_id": user_object_id})
    if not user:
        return fail("User not found", 404, code="not_found")

    documents = list(
        extensions.db.documents.find(
            {"userId": user_object_id}, {"path": 0}
        ).sort("createdAt", -1)
    )

    serialized = []
    for doc in documents:
        row = serialize_dict(doc)
        row["displayName"] = _display_name(doc)
        serialized.append(row)

    return ok(
        {
            "userEmail": user.get("email"),
            "documents": serialized,
            "count": len(serialized),
        }
    )


@admin_bp.route("/users/<user_id>/queries", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def get_user_queries(user_id):
    db_error = _require_db()
    if db_error:
        return db_error

    if not ObjectId.is_valid(user_id):
        return fail("Invalid user id", 400, code="invalid_id")

    user_object_id = ObjectId(user_id)
    user = extensions.db.users.find_one({"_id": user_object_id})
    if not user:
        return fail("User not found", 404, code="not_found")

    page, limit, skip = _pagination()

    queries = list(
        extensions.db.chat_messages.find({"userId": user_object_id})
        .sort("createdAt", -1)
        .skip(skip)
        .limit(limit)
    )
    total = extensions.db.chat_messages.count_documents({"userId": user_object_id})

    return ok(
        {
            "userEmail": user.get("email"),
            "queries": [serialize_dict(q) for q in queries],
            "count": len(queries),
            "pagination": {"page": page, "limit": limit, "total": total},
        }
    )


# ----------------------------------------------------------------------
# Documents
# ----------------------------------------------------------------------
@admin_bp.route("/documents", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def get_all_documents():
    db_error = _require_db()
    if db_error:
        return db_error

    page, limit, skip = _pagination()

    try:
        pipeline = [
            {
                "$lookup": {
                    "from": "users",
                    "localField": "userId",
                    "foreignField": "_id",
                    "as": "user",
                }
            },
            # preserveNull keeps a document visible even if its owner row is
            # gone, instead of silently dropping it from the admin view.
            {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "_id": 1,
                    "filename": {"$ifNull": ["$originalFilename", "$filename"]},
                    "storedFilename": "$filename",
                    "enabled": {"$ifNull": ["$enabled", True]},
                    "status": {"$ifNull": ["$status", "processed"]},
                    "size": {"$ifNull": ["$size", 0]},
                    "totalChunks": {"$ifNull": ["$totalChunks", 0]},
                    "error": 1,
                    "createdAt": 1,
                    "userEmail": {"$ifNull": ["$user.email", "unknown"]},
                    "userId": 1,
                }
            },
            {"$sort": {"createdAt": -1}},
        ]

        search = _search_regex(["filename", "originalFilename"])
        if search:
            pipeline.insert(0, {"$match": search})

        status_filter = (request.args.get("status") or "").strip()
        if status_filter in {"processing", "processed", "failed"}:
            pipeline.insert(0, {"$match": {"status": status_filter}})

        count_pipeline = [
            stage for stage in pipeline if list(stage)[0] in {"$match", "$lookup", "$unwind"}
        ] + [{"$count": "total"}]
        count_result = list(extensions.db.documents.aggregate(count_pipeline))
        total = count_result[0]["total"] if count_result else 0

        pipeline += [{"$skip": skip}, {"$limit": limit}]
        documents = [serialize_dict(d) for d in extensions.db.documents.aggregate(pipeline)]

        return ok(
            {
                "documents": documents,
                "count": len(documents),
                "pagination": {"page": page, "limit": limit, "total": total},
            }
        )

    except Exception:
        logger.exception("Failed to fetch documents")
        return fail("Failed to fetch documents", 500, code="query_failed")


@admin_bp.route("/documents/<doc_id>/toggle", methods=["PATCH"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def toggle_document(doc_id):
    db_error = _require_db()
    if db_error:
        return db_error

    try:
        document_object_id = ObjectId(doc_id)
    except (InvalidId, TypeError):
        return fail("Invalid document id", 400, code="invalid_id")

    doc = extensions.db.documents.find_one({"_id": document_object_id})
    if not doc:
        return fail("Document not found", 404, code="not_found")

    new_status = not doc.get("enabled", True)

    extensions.db.documents.update_one(
        {"_id": document_object_id}, {"$set": {"enabled": new_status}}
    )

    return ok({"documentId": doc_id, "enabled": new_status})


# ----------------------------------------------------------------------
# Queries
# ----------------------------------------------------------------------
@admin_bp.route("/queries", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def view_queries():
    db_error = _require_db()
    if db_error:
        return db_error

    page, limit, skip = _pagination()

    try:
        pipeline = [
            {
                "$lookup": {
                    "from": "users",
                    "localField": "userId",
                    "foreignField": "_id",
                    "as": "user",
                }
            },
            {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "_id": 1,
                    "question": 1,
                    "answer": 1,
                    "createdAt": 1,
                    "documentId": 1,
                    "userEmail": {"$ifNull": ["$user.email", "unknown"]},
                    "userId": 1,
                }
            },
            {"$sort": {"createdAt": -1}},
        ]

        search = _search_regex(["question", "answer"])
        if search:
            pipeline.insert(0, {"$match": search})

        count_pipeline = [
            stage for stage in pipeline if list(stage)[0] in {"$match", "$lookup", "$unwind"}
        ] + [{"$count": "total"}]
        count_result = list(extensions.db.chat_messages.aggregate(count_pipeline))
        total = count_result[0]["total"] if count_result else 0

        pipeline += [{"$skip": skip}, {"$limit": limit}]
        queries = [
            serialize_dict(q) for q in extensions.db.chat_messages.aggregate(pipeline)
        ]

        return ok(
            {
                "queries": queries,
                "count": len(queries),
                "pagination": {"page": page, "limit": limit, "total": total},
            }
        )

    except Exception:
        logger.exception("Failed to fetch queries")
        return fail("Failed to fetch queries", 500, code="query_failed")


# ----------------------------------------------------------------------
# Usage
# ----------------------------------------------------------------------
@admin_bp.route("/usage", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def usage_stats():
    db_error = _require_db()
    if db_error:
        return db_error

    try:
        usage = list(
            extensions.db.usage_logs.aggregate(
                [
                    {
                        "$group": {
                            "_id": "$userId",
                            "tokens": {"$sum": "$tokens"},
                            "requests": {"$sum": 1},
                            "embeddingTokens": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$type", "embedding"]},
                                        "$tokens",
                                        0,
                                    ]
                                }
                            },
                            "generationTokens": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$type", "generation"]},
                                        "$tokens",
                                        0,
                                    ]
                                }
                            },
                            "lastUsedAt": {"$max": "$createdAt"},
                        }
                    },
                    {
                        "$lookup": {
                            "from": "users",
                            "localField": "_id",
                            "foreignField": "_id",
                            "as": "user",
                        }
                    },
                    {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
                    {
                        "$project": {
                            "_id": 0,
                            "userId": "$_id",
                            # The old pipeline grouped by email and left this
                            # field absent, so the UI fell back to showing an id.
                            "userEmail": {"$ifNull": ["$user.email", "Deleted user"]},
                            "tokens": 1,
                            "requests": 1,
                            "embeddingTokens": 1,
                            "generationTokens": 1,
                            "lastUsedAt": 1,
                        }
                    },
                    {"$sort": {"tokens": -1}},
                ]
            )
        )

        formatted = [serialize_dict(u) for u in usage]

        return ok(
            {
                "usage": formatted,
                "count": len(formatted),
                "totalTokens": sum(u.get("tokens", 0) for u in formatted),
            }
        )

    except Exception:
        logger.exception("Failed to fetch usage stats")
        return fail("Failed to fetch usage stats", 500, code="query_failed")


# ----------------------------------------------------------------------
# Dashboard
# ----------------------------------------------------------------------
@admin_bp.route("/stats", methods=["GET"])
@jwt_required(role="admin")
@limiter.limit(lambda: Config.RATELIMIT_READ)
def dashboard_stats():
    db_error = _require_db()
    if db_error:
        return db_error

    try:
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)
        prev_week_start = today_start - timedelta(days=14)

        documents = extensions.db.documents
        chat_messages = extensions.db.chat_messages
        users = extensions.db.users

        total_tokens_result = list(
            extensions.db.usage_logs.aggregate(
                [{"$group": {"_id": None, "total": {"$sum": "$tokens"}}}]
            )
        )

        users_this_week = users.count_documents({"createdAt": {"$gte": week_start}})
        users_prev_week = users.count_documents(
            {"createdAt": {"$gte": prev_week_start, "$lt": week_start}}
        )

        if users_prev_week:
            user_growth = round(
                (users_this_week - users_prev_week) / users_prev_week * 100
            )
        else:
            user_growth = 100 if users_this_week else 0

        stats = {
            "totalUsers": users.count_documents({}),
            "newUsersThisWeek": users_this_week,
            # Replaces the hardcoded "+12% vs last week" the dashboard used to show.
            "userGrowthPercent": user_growth,
            "totalDocuments": documents.count_documents({}),
            "activeDocuments": documents.count_documents({"enabled": {"$ne": False}}),
            "processingDocuments": documents.count_documents({"status": "processing"}),
            "failedDocuments": documents.count_documents({"status": "failed"}),
            "totalQueries": chat_messages.count_documents({}),
            "queriesToday": chat_messages.count_documents(
                {"createdAt": {"$gte": today_start}}
            ),
            "queriesThisWeek": chat_messages.count_documents(
                {"createdAt": {"$gte": week_start}}
            ),
            "totalTokens": total_tokens_result[0]["total"] if total_tokens_result else 0,
        }

        return ok({"stats": stats})

    except Exception:
        logger.exception("Failed to fetch dashboard stats")
        return fail("Failed to fetch dashboard stats", 500, code="query_failed")
