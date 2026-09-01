import os

from dotenv import load_dotenv

load_dotenv()

DEBUG = os.getenv("FLASK_DEBUG", "1") == "1"

# With the reloader on, Werkzeug runs two processes: a parent that only watches
# files and a child that actually serves. Only the child should load the
# embedding model, otherwise it is loaded twice and costs twice the memory.
IS_RELOADER_WATCHER = DEBUG and os.environ.get("WERKZEUG_RUN_MAIN") != "true"

from app.main import create_app  # noqa: E402  (env must load before config)

app = create_app(warm_embeddings=not IS_RELOADER_WATCHER)

if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 5000)),
        debug=DEBUG,
        use_reloader=DEBUG,
        threaded=True,
    )
