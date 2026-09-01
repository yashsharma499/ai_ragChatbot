import logging

from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError

logger = logging.getLogger(__name__)

mongo_client = None
db = None
mongo_connected = False


def rate_limit_key():
    """
    Rate limit per authenticated user when we know who they are, otherwise per IP.
    `jwt_required` runs before `limiter.limit` on protected routes, so
    `request.user` is already populated there.
    """
    user = getattr(request, "user", None)
    if user and user.get("userId"):
        return f"user:{user['userId']}"
    return get_remote_address()


limiter = Limiter(
    key_func=rate_limit_key,
    default_limits=[],
)


def init_mongo(app):
    global mongo_client, db, mongo_connected

    try:
        mongo_uri = app.config["MONGO_URI"]
        mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        mongo_client.admin.command("ping")

        db = mongo_client.get_default_database()
        if db is None:
            raise RuntimeError(
                "MONGO_URI has no database name. "
                "Use e.g. mongodb://localhost:27017/ai_knowledge"
            )

        mongo_connected = True
        logger.info("MongoDB connected: %s", db.name)
        _ensure_indexes()

    except (PyMongoError, ServerSelectionTimeoutError, RuntimeError) as e:
        db = None
        mongo_connected = False
        logger.error("MongoDB connection failed: %s", e)


def _ensure_indexes():
    """
    Create the indexes every hot query path relies on. Idempotent, so it is safe
    to run on every boot.
    """
    try:
        db.users.create_index([("email", ASCENDING)], unique=True, name="uniq_email")

        db.documents.create_index(
            [("userId", ASCENDING), ("createdAt", DESCENDING)], name="user_recent"
        )
        db.documents.create_index([("createdAt", DESCENDING)], name="recent")

        db.documents_chunk.create_index(
            [("vectorId", ASCENDING)], unique=True, name="uniq_vector"
        )
        db.documents_chunk.create_index(
            [("documentId", ASCENDING), ("chunkIndex", ASCENDING)], name="doc_chunks"
        )

        db.chat_messages.create_index(
            [("userId", ASCENDING), ("documentId", ASCENDING), ("createdAt", ASCENDING)],
            name="user_doc_thread",
        )
        db.chat_messages.create_index([("createdAt", DESCENDING)], name="recent")

        db.usage_logs.create_index([("userId", ASCENDING)], name="by_user")
        db.usage_logs.create_index([("createdAt", DESCENDING)], name="recent")

        logger.info("MongoDB indexes ensured")
    except PyMongoError as e:
        # Pre-existing duplicate emails would make the unique index fail. Log it
        # rather than refusing to boot.
        logger.warning("Could not ensure all indexes: %s", e)


def get_db():
    """Returns the database handle, or None when Mongo is unavailable."""
    return db
