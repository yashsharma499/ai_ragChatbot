"""
Creates the Pinecone index for the configured embedding backend and re-embeds
every stored document chunk into it.

Switching EMBEDDING_BACKEND changes the vector width (local = 384, pinecone =
1024), and an index has a fixed dimension. So a switch needs a new index and a
re-embed of existing content. The chunk text already lives in MongoDB, so
nothing has to be re-uploaded or re-parsed.

    python reindex.py --create        # create the index if it is missing
    python reindex.py                 # re-embed everything into it
    python reindex.py --create --yes  # both, no prompts

Safe to re-run: vectors are upserted by a deterministic id.
"""

import argparse
import sys
import time

from dotenv import load_dotenv

load_dotenv()

import app.extensions as extensions  # noqa: E402
from app.config import Config  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.embedding_service import embedding_service  # noqa: E402
from app.services.vector_service import VectorService  # noqa: E402

BATCH = 64


def ensure_index(client, name, dimension):
    existing = {i["name"]: i for i in client.list_indexes()}

    if name in existing:
        actual = existing[name]["dimension"]
        if actual != dimension:
            print(
                f"ERROR: index '{name}' has dimension {actual}, but "
                f"EMBEDDING_BACKEND={Config.EMBEDDING_BACKEND} produces {dimension}.\n"
                f"       Point PINECONE_INDEX_NAME at a new index and re-run with --create."
            )
            return False
        print(f"OK: index '{name}' exists with dimension {dimension}.")
        return True

    from pinecone import ServerlessSpec

    print(f"Creating index '{name}' (dimension={dimension}, metric=cosine) ...")
    client.create_index(
        name=name,
        dimension=dimension,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    )

    for _ in range(60):
        if client.describe_index(name).status.get("ready"):
            print("OK: index ready.")
            return True
        time.sleep(2)

    print("ERROR: index did not become ready in time.")
    return False


def reindex():
    chunks = list(
        extensions.db.documents_chunk.find(
            {}, {"_id": 0, "vectorId": 1, "text": 1, "userId": 1, "documentId": 1, "chunkIndex": 1}
        )
    )
    if not chunks:
        print("Nothing to re-index: no chunks stored.")
        return 0

    documents = {d["_id"]: d for d in extensions.db.documents.find({}, {"filename": 1})}
    index = VectorService.get_index()
    total = 0

    print(f"Re-embedding {len(chunks)} chunks with {Config.EMBEDDING_BACKEND} ...")

    for start in range(0, len(chunks), BATCH):
        window = chunks[start : start + BATCH]
        vectors = embedding_service.embed_texts(
            [c["text"] for c in window], input_type="passage"
        )

        index.upsert(
            vectors=[
                {
                    "id": c["vectorId"],
                    "values": v,
                    "metadata": {
                        "userId": str(c["userId"]),
                        "documentId": str(c["documentId"]),
                        "chunkIndex": int(c.get("chunkIndex", 0)),
                        "filename": documents.get(c["documentId"], {}).get("filename", ""),
                        "preview": c["text"][:180],
                    },
                }
                for c, v in zip(window, vectors)
            ]
        )

        total += len(window)
        print(f"  {total}/{len(chunks)}")

    print(f"Done: {total} vectors written to '{Config.PINECONE_INDEX_NAME}'.")
    return total


def main():
    parser = argparse.ArgumentParser(description="Create the index and re-embed chunks")
    parser.add_argument("--create", action="store_true", help="create the index if missing")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()

    dimension = Config.expected_dimension()
    print(f"backend : {Config.EMBEDDING_BACKEND} ({dimension} dimensions)")
    print(f"index   : {Config.PINECONE_INDEX_NAME}")
    print()

    app = create_app(warm_embeddings=False)
    with app.app_context():
        if extensions.db is None:
            print("ERROR: MongoDB unreachable. Check MONGO_URI.")
            return 1

        client = VectorService.get_client()

        if args.create and not ensure_index(client, Config.PINECONE_INDEX_NAME, dimension):
            return 1

        if not args.yes:
            count = extensions.db.documents_chunk.count_documents({})
            reply = input(f"Re-embed {count} chunks into '{Config.PINECONE_INDEX_NAME}'? [y/N] ")
            if reply.strip().lower() not in {"y", "yes"}:
                print("Aborted.")
                return 0

        reindex()

    return 0


if __name__ == "__main__":
    sys.exit(main())
