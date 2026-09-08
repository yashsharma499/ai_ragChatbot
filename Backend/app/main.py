import logging
import os
import threading
import time
import uuid

from flask import Flask, g, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

import app.extensions as extensions
from app.config import Config
from app.extensions import init_mongo, limiter
from app.utils.responses import fail

logger = logging.getLogger(__name__)


def _configure_logging(app):
    level = logging.DEBUG if app.debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    # These are noisy and rarely useful at INFO.
    logging.getLogger("pymongo").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def _register_error_handlers(app):
    """
    Guarantees every error leaves as the same JSON envelope. Without this, Flask
    returns HTML for 404/405/500 and the frontend's error parsing shows
    "Something went wrong" for everything.
    """

    @app.errorhandler(400)
    def bad_request(_e):
        return fail("Malformed request", 400, code="bad_request")

    @app.errorhandler(404)
    def not_found(_e):
        return fail(f"No such endpoint: {request.method} {request.path}", 404, code="not_found")

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return fail(
            f"{request.method} is not allowed on {request.path}", 405, code="method_not_allowed"
        )

    @app.errorhandler(413)
    def payload_too_large(_e):
        return fail(
            f"File is too large. The maximum upload size is {Config.MAX_UPLOAD_MB}MB.",
            413,
            code="too_large",
        )

    @app.errorhandler(429)
    def rate_limited(e):
        description = getattr(e, "description", "") or ""
        return fail(
            f"Too many requests. Please slow down. ({description})".strip(),
            429,
            code="rate_limited",
        )

    @app.errorhandler(HTTPException)
    def http_exception(e):
        return fail(e.description or e.name, e.code or 500, code="http_error")

    @app.errorhandler(Exception)
    def unhandled(e):
        request_id = getattr(g, "request_id", "-")
        logger.exception("Unhandled error [%s] on %s %s", request_id, request.method, request.path)
        return fail(
            "An unexpected server error occurred. Please try again.",
            500,
            code="server_error",
            requestId=request_id,
        )


def _register_request_logging(app):
    @app.before_request
    def start_timer():
        g.request_id = uuid.uuid4().hex[:8]
        g.started_at = time.perf_counter()

    @app.after_request
    def log_request(response):
        started_at = getattr(g, "started_at", None)
        if started_at is not None and request.path != "/health":
            duration_ms = (time.perf_counter() - started_at) * 1000
            logger.info(
                "%s %s -> %s (%.0fms)",
                request.method,
                request.path,
                response.status_code,
                duration_ms,
            )
        return response


def _warm_embedding_model():
    """
    Loads the sentence-transformer in the background at boot.

    Left lazy, the very first upload or question pays the whole model load —
    around 40 seconds, and far longer on a cold machine that must download it —
    which reads as a hung app. Boot is not blocked, so the server answers
    health and auth immediately while this runs.
    """

    def warm():
        from app.services.embedding_service import EmbeddingService

        started = time.perf_counter()
        EmbeddingService.warmup()
        logger.info("Embedding model warm in %.1fs", time.perf_counter() - started)

    threading.Thread(target=warm, daemon=True, name="embed-warmup").start()


def create_app(warm_embeddings=None):
    """
    `warm_embeddings` preloads the embedding model in a background thread.
    Callers pass False explicitly for short-lived processes (the admin seeder,
    the test suite, the dev reloader's watcher process); leaving it None reads
    the WARM_EMBEDDINGS environment variable, which defaults to on.
    """
    if warm_embeddings is None:
        warm_embeddings = os.getenv("WARM_EMBEDDINGS", "1") == "1"

    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["RATELIMIT_STORAGE_URI"] = Config.RATELIMIT_STORAGE_URI
    # Werkzeug rejects oversized bodies before they reach a view.
    app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH
    app.json.sort_keys = False

    _configure_logging(app)

    CORS(
        app,
        origins=Config.CORS_ORIGINS,
        supports_credentials=True,
        expose_headers=["Content-Disposition"],
    )

    init_mongo(app)
    limiter.init_app(app)

    _register_request_logging(app)
    _register_error_handlers(app)

    from app.routes.admin import admin_bp
    from app.routes.auth import auth_bp
    from app.routes.chat import chat_bp
    from app.routes.documents import documents_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(documents_bp, url_prefix="/documents")
    app.register_blueprint(chat_bp, url_prefix="/chat")
    app.register_blueprint(admin_bp, url_prefix="/admin")

    @app.route("/")
    @app.route("/health")
    @limiter.exempt
    def health():
        """
        Reports what actually works, so a misconfigured deploy is obvious from
        one request rather than from a failed upload ten minutes later.
        """
        missing_keys = Config.missing_ai_keys()
        healthy = extensions.mongo_connected and not missing_keys

        return (
            {
                "status": "ok" if healthy else "degraded",
                "service": "AI Knowledge Assistant API",
                "database": "connected" if extensions.mongo_connected else "disconnected",
                "ai": "configured" if not missing_keys else "not_configured",
                "missingConfig": missing_keys,
            },
            200 if healthy else 503,
        )

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    # Hosted embeddings have nothing to preload; the warmup only matters for
    # the in-process model.
    if warm_embeddings and Config.uses_local_embeddings():
        _warm_embedding_model()

    logger.info(
        "App ready | db=%s | ai=%s | embeddings=%s (%sd) | cors=%s",
        "up" if extensions.mongo_connected else "down",
        "ok" if not Config.missing_ai_keys() else "missing",
        Config.EMBEDDING_BACKEND,
        Config.expected_dimension(),
        ",".join(Config.CORS_ORIGINS),
    )

    return app
