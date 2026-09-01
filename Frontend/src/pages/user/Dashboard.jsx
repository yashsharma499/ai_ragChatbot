import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ChatWindow from "../../components/ChatWindow";
import DocumentList from "../../components/DocumentList";
import Navbar from "../../components/Navbar";
import UploadDocument from "../../components/UploadDocument";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Icon from "../../components/ui/Icon";
import { EmptyState, ErrorState, Skeleton, StatusBadge } from "../../components/ui/States";
import { useToast } from "../../components/ui/toast-context";
import { chatAPI, documentAPI } from "../../services/api";
import { displayFilename, formatBytes } from "../../utils/format";

const POLL_INTERVAL_MS = 3000;

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentsError, setDocumentsError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const toast = useToast();
  // Guards against a slow history response overwriting a newer selection.
  const historyRequestId = useRef(0);

  /* ---------------------------------------------------------------- */
  /* Documents                                                        */
  /* ---------------------------------------------------------------- */
  const fetchDocuments = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingDocuments(true);
    try {
      const list = await documentAPI.list();
      setDocuments(Array.isArray(list) ? list : []);
      setDocumentsError("");
    } catch (err) {
      // A failed background poll must not wipe the list already on screen.
      if (!quiet) setDocumentsError(err.message || "Could not load your documents");
    } finally {
      if (!quiet) setLoadingDocuments(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const processingCount = useMemo(
    () => documents.filter((doc) => doc.status === "processing").length,
    [documents]
  );

  /* Poll only while something is actually processing. Keyed on the count
     rather than the whole array, so the interval is not torn down and rebuilt
     on every single refresh. */
  useEffect(() => {
    if (processingCount === 0) return undefined;

    const interval = setInterval(() => fetchDocuments({ quiet: true }), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [processingCount, fetchDocuments]);

  const selectedDocument = useMemo(
    () => documents.find((doc) => (doc.documentId ?? doc._id) === selectedId) ?? null,
    [documents, selectedId]
  );

  const visibleDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((doc) =>
      displayFilename(doc.filename).toLowerCase().includes(term)
    );
  }, [documents, search]);

  /* Announce when a document the user is waiting on becomes ready. */
  const previousStatuses = useRef(new Map());
  useEffect(() => {
    const next = new Map();

    documents.forEach((doc) => {
      const id = doc.documentId ?? doc._id;
      next.set(id, doc.status);

      const before = previousStatuses.current.get(id);
      if (before === "processing" && doc.status === "processed") {
        toast.success(`"${displayFilename(doc.filename)}" is ready to query.`);
      }
      if (before === "processing" && doc.status === "failed") {
        toast.error(doc.error || `"${displayFilename(doc.filename)}" could not be processed.`);
      }
    });

    previousStatuses.current = next;
  }, [documents, toast]);

  /* ---------------------------------------------------------------- */
  /* Chat                                                             */
  /* ---------------------------------------------------------------- */
  const openDocument = useCallback(async (doc) => {
    const id = doc.documentId ?? doc._id;
    setSelectedId(id);
    setMessages([]);

    const requestId = ++historyRequestId.current;
    setLoadingChat(true);

    try {
      const history = await chatAPI.history(id);
      if (historyRequestId.current === requestId) {
        setMessages(Array.isArray(history) ? history : []);
      }
    } catch {
      if (historyRequestId.current === requestId) setMessages([]);
    } finally {
      if (historyRequestId.current === requestId) setLoadingChat(false);
    }
  }, []);

  const askQuestion = useCallback(
    async (question) => {
      if (!selectedDocument || isSending) return;

      const documentId = selectedDocument.documentId ?? selectedDocument._id;
      const pendingKey = `pending-${Date.now()}`;

      setIsSending(true);
      setMessages((current) => [
        ...current,
        { messageId: pendingKey, question, answer: "", pending: true },
      ]);

      try {
        const result = await chatAPI.ask({ documentId, question });

        setMessages((current) =>
          current.map((message) =>
            message.messageId === pendingKey
              ? {
                  messageId: result.messageId ?? pendingKey,
                  question,
                  answer: result.answer,
                  sources: result.sources,
                  createdAt: result.createdAt ?? new Date().toISOString(),
                }
              : message
          )
        );
      } catch (err) {
        // Keep the failed turn visible with a retry, rather than dropping it.
        setMessages((current) =>
          current.map((message) =>
            message.messageId === pendingKey
              ? {
                  messageId: pendingKey,
                  question,
                  answer: err.message || "That question could not be answered.",
                  failed: true,
                  createdAt: new Date().toISOString(),
                }
              : message
          )
        );
        toast.error(err.message || "Could not get an answer");
      } finally {
        setIsSending(false);
      }
    },
    [selectedDocument, isSending, toast]
  );

  const retryQuestion = useCallback(
    (question) => {
      setMessages((current) => current.filter((message) => !message.failed));
      askQuestion(question);
    },
    [askQuestion]
  );

  /* ---------------------------------------------------------------- */
  /* Destructive actions                                              */
  /* ---------------------------------------------------------------- */
  const requestDelete = (doc) =>
    setConfirm({
      kind: "delete",
      doc,
      title: "Delete this document?",
      message: `"${displayFilename(
        doc.filename
      )}" and its entire conversation history will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete",
    });

  const requestClearChat = () =>
    setConfirm({
      kind: "clear",
      title: "Clear this conversation?",
      message: "Every question and answer for this document will be deleted.",
      confirmLabel: "Clear",
    });

  const runConfirmedAction = async () => {
    if (!confirm) return;
    setConfirmBusy(true);

    try {
      if (confirm.kind === "delete") {
        const id = confirm.doc.documentId ?? confirm.doc._id;
        await documentAPI.remove(id);

        setDocuments((current) =>
          current.filter((doc) => (doc.documentId ?? doc._id) !== id)
        );
        if (selectedId === id) {
          setSelectedId(null);
          setMessages([]);
        }
        toast.success("Document deleted");
      } else {
        const id = selectedDocument.documentId ?? selectedDocument._id;
        await chatAPI.clear(id);
        setMessages([]);
        toast.success("Conversation cleared");
      }
      setConfirm(null);
    } catch (err) {
      toast.error(err.message || "That action failed");
    } finally {
      setConfirmBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  const canChat =
    selectedDocument?.status === "processed" && selectedDocument?.enabled !== false;

  const disabledReason = !selectedDocument
    ? ""
    : selectedDocument.enabled === false
      ? "An administrator has disabled this document."
      : selectedDocument.status === "processing"
        ? "This document is still being processed."
        : selectedDocument.status === "failed"
          ? selectedDocument.error || "This document could not be processed."
          : "";

  return (
    <>
      <Navbar />

      <main className="min-h-[calc(100vh-4rem)] bg-[#020617] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Your documents
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload a file, wait for it to be indexed, then ask questions about it.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left column */}
            <div className="flex flex-col gap-5 lg:col-span-4 xl:col-span-3">
              <section className="rounded-2xl border border-white/5 bg-slate-900/50 p-5 backdrop-blur-xl">
                <h2 className="mb-3 text-sm font-bold text-white">Upload a document</h2>
                <UploadDocument onUploaded={() => fetchDocuments({ quiet: true })} />
              </section>

              <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-xl">
                <div className="border-b border-white/5 px-4 py-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">
                      Library
                      <span className="ml-2 text-xs font-medium text-slate-500">
                        {documents.length}
                      </span>
                    </h2>

                    <button
                      type="button"
                      onClick={() => fetchDocuments()}
                      aria-label="Refresh documents"
                      title="Refresh"
                      className="group rounded-lg border border-white/5 bg-white/5 p-1.5 text-slate-400 transition-colors hover:text-white"
                    >
                      <Icon
                        name="refresh"
                        className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180"
                      />
                    </button>
                  </div>

                  {documents.length > 3 && (
                    <div className="relative">
                      <Icon
                        name="search"
                        className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500"
                      />
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Filter documents…"
                        aria-label="Filter documents"
                        className="w-full rounded-lg border border-white/10 bg-slate-950/50 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 transition-colors focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>

                <div className="custom-scrollbar max-h-[26rem] overflow-y-auto p-3">
                  {loadingDocuments ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((key) => (
                        <Skeleton key={key} className="h-[74px] w-full rounded-xl" />
                      ))}
                    </div>
                  ) : documentsError ? (
                    <ErrorState
                      message={documentsError}
                      onRetry={() => fetchDocuments()}
                      className="py-8"
                    />
                  ) : documents.length === 0 ? (
                    <EmptyState
                      icon="document"
                      title="No documents yet"
                      message="Upload a PDF or text file above to get started."
                      className="py-8"
                    />
                  ) : visibleDocuments.length === 0 ? (
                    <EmptyState
                      icon="search"
                      title="No matches"
                      message={`Nothing matches "${search}".`}
                      className="py-8"
                    />
                  ) : (
                    <DocumentList
                      documents={visibleDocuments}
                      selectedId={selectedId}
                      onSelect={openDocument}
                      onDelete={requestDelete}
                    />
                  )}
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className="lg:col-span-8 xl:col-span-9">
              <div className="flex h-[calc(100vh-11rem)] min-h-[32rem] flex-col">
                {selectedDocument ? (
                  <>
                    {/* The overlay is positioned against this wrapper. The old
                        version used `absolute inset-0` with no positioned
                        ancestor, so it covered the entire viewport. */}
                    <div className="relative min-h-0 flex-1">
                      <ChatWindow
                        title={displayFilename(selectedDocument.filename)}
                        subtitle={
                          <>
                            <StatusBadge
                              status={
                                selectedDocument.enabled === false
                                  ? "disabled"
                                  : selectedDocument.status
                              }
                            />
                            {selectedDocument.totalChunks > 0 && (
                              <span>
                                {selectedDocument.totalChunks}{" "}
                                {selectedDocument.totalChunks === 1
                                  ? "passage"
                                  : "passages"}{" "}
                                indexed
                              </span>
                            )}
                            {selectedDocument.size > 0 && (
                              <span>{formatBytes(selectedDocument.size)}</span>
                            )}
                          </>
                        }
                        messages={messages}
                        onSend={askQuestion}
                        onRetry={retryQuestion}
                        onClear={requestClearChat}
                        isSending={isSending}
                        disabled={!canChat}
                        disabledReason={disabledReason}
                      />

                      {loadingChat && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/60 backdrop-blur-sm">
                          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 shadow-2xl">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
                            <p className="text-sm font-medium text-slate-300">
                              Loading conversation…
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // The old empty panel had no height and collapsed to a sliver.
                  <div className="flex h-full items-center justify-center rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-xl">
                    <EmptyState
                      icon="chat"
                      title={
                        documents.length === 0
                          ? "Upload a document to begin"
                          : "Select a document"
                      }
                      message={
                        documents.length === 0
                          ? "Once a document finishes processing you can ask questions about its contents."
                          : "Choose a document from your library to open its conversation."
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive
        busy={confirmBusy}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
