# AI-Powered Knowledge Assistant (RAG)

Upload a PDF or text document, and ask questions about it in plain language.
Answers are generated only from the passages retrieved out of your own files,
and every answer cites the passages it used so you can check it.

- **Frontend** — React 19 + Vite + Tailwind v4
- **Backend** — Flask (Python 3.11)
- **Store** — MongoDB (metadata, chunks, chat history, usage)
- **Vectors** — Pinecone (cosine, 384 dimensions)
- **Embeddings** — `all-MiniLM-L6-v2`, running locally, no API key needed
- **Generation** — Groq

---

## Quick start

You need Python 3.11, Node 18+, a MongoDB database, a Pinecone index and a Groq
API key.

### 1. Backend

```bash
cd Backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env           # then fill in the values (see below)
python run.py
```

The API comes up on <http://localhost:5000>. Check it with:

```bash
curl http://localhost:5000/health
```

`status: "ok"` means the database and both AI services are reachable.
`status: "degraded"` lists exactly what is missing in `missingConfig`.

> On first run the embedding model (~90 MB) downloads and loads in the
> background. The server is usable immediately; uploads just queue until the
> model is warm, which the log reports as `Embedding model warm in Ns`.

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

### 3. Create an admin

Registration always creates a normal user — there is no way to self-promote
through the API. Make the first admin from the command line:

```bash
cd Backend
python seed_admin.py admin@yourcompany.com "SuperSecret1"
```

Run it against an existing email to promote that account instead. You can also
list emails in `ADMIN_EMAILS` in `.env` to auto-promote them on sign-in.

---

## Configuration

Everything lives in `Backend/.env` (see `.env.example` for the full annotated
list). The values worth knowing:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY`, `JWT_SECRET` | Required. The app refuses to boot without them. |
| `MONGO_URI` | Must include a database name, e.g. `.../ai_knowledge`. |
| `GROQ_API_KEY`, `GROQ_MODEL` | Groq retires models often — check <https://console.groq.com/docs/models>. |
| `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` | Index must be **dimension 384, metric cosine**. |
| `ADMIN_EMAILS` | Comma-separated emails auto-promoted to admin. |
| `CORS_ORIGINS` | Comma-separated frontend origins. |
| `CHUNK_SIZE`, `CHUNK_OVERLAP` | Passage size in characters. |
| `RAG_TOP_K`, `RAG_RELATIVE_RATIO` | Retrieval breadth and relevance cutoff. |
| `MAX_UPLOAD_MB` | Upload ceiling, default 5. |
| `RATELIMIT_*` | Per-endpoint limits in flask-limiter syntax. |

The frontend only needs `VITE_API_BASE_URL` (see `Frontend/.env.example`).

---

## How it works

**Ingestion.** An upload is validated (extension, MIME type, size, and the
actual leading bytes) and saved, then a background thread extracts the text,
normalises whitespace, and splits it into overlapping chunks that end on
paragraph or sentence boundaries. Chunks are embedded in one batched call and
upserted to Pinecone together with the owning user and document id. The
document row moves `processing → processed`, or `failed` with a message
explaining why.

**Retrieval.** A question is embedded and matched against Pinecone, filtered to
that user and document. Matches are then judged *relative to the best hit for
that query* rather than against a fixed score, because absolute cosine
similarity varies a lot with passage length. The surviving chunks are fetched
from MongoDB in a single query, de-duplicated, and ordered by relevance.

**Generation.** The passages, the last few conversation turns, and the question
go to Groq under a prompt that forbids outside knowledge about the document and
requires numbered citations. If nothing relevant was retrieved, the model is
never called — the app says so directly.

---

## Testing

```bash
cd Backend
pip install pytest mongomock
python -m pytest tests/ -q
```

122 tests covering auth and JWT handling, upload validation, ownership
isolation, the chunker, retrieval filtering, the admin endpoints, and the JSON
error contract. They use an in-memory MongoDB and stub the AI services, so they
need no keys and no network.

---

## API

All responses share one shape:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "message": "Human readable", "code": "machine_readable" }
```

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/health` | Reports database and AI configuration status. |
| `POST` | `/auth/register` | Returns a token — new accounts are signed in directly. |
| `POST` | `/auth/login` | |
| `GET` | `/auth/me` | Validates the stored token on app boot. |
| `POST` | `/documents/upload` | multipart; PDF, TXT, MD. |
| `GET` | `/documents/list` | Caller's own documents only. |
| `GET` | `/documents/<id>` | |
| `DELETE` | `/documents/<id>` | Removes file, chunks, vectors and chat history. |
| `POST` | `/chat/ask` | `{ documentId, question }` → answer plus sources. |
| `GET` | `/chat/history?documentId=` | |
| `DELETE` | `/chat/history?documentId=` | |
| `GET` | `/admin/stats` | Admin only, as are all `/admin/*` routes. |
| `GET` | `/admin/users`, `/admin/users/<id>/documents`, `/admin/users/<id>/queries` | |
| `GET` | `/admin/documents` | Paginated, searchable, filterable by status. |
| `PATCH` | `/admin/documents/<id>/toggle` | Enable/disable a user's document. |
| `GET` | `/admin/queries` | Paginated and searchable. |
| `GET` | `/admin/usage` | Token consumption per account. |

---

## Deploying

`Procfile` runs gunicorn with a single worker and 8 threads. That is deliberate:
each worker loads its own copy of the embedding model, so more workers multiply
memory rather than throughput. To scale out, run multiple instances and set
`RATELIMIT_STORAGE_URI` to a shared Redis so rate limits are enforced globally.

Uploaded files are written to local disk. On a platform with an ephemeral
filesystem they disappear on restart — this only affects re-ingestion, since
chunks and vectors are already persisted, but attach a volume if you need the
originals.

---

## Project layout

```
Backend/
  app/
    routes/        auth, documents, chat, admin blueprints
    services/      auth, document, chat, embedding, vector
    middlewares/   JWT auth, JSON validation
    utils/         file loading, chunking, serialisation, responses
    config.py      all tunables, read from the environment
    main.py        app factory, error handlers, health
  tests/           pytest suite
  seed_admin.py    create or promote an administrator

Frontend/
  src/
    components/    Navbar, ChatWindow, ChatMessage, DocumentList, UploadDocument
      ui/          Icon, Toast, ConfirmDialog, States
    pages/
      admin/       dashboard, users, documents, queries, usage
      user/        dashboard
      auth/        shared layout, field, validators
    context/       auth provider and hook
    services/      API client and error normalisation
    utils/         formatting helpers
```
