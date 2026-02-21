import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import UploadDocument from "../../components/UploadDocument";
import DocumentList from "../../components/DocumentList";
import ChatWindow from "../../components/ChatWindow";
import { documentAPI, chatAPI } from "../../services/api";

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [hoveredDocId, setHoveredDocId] = useState(null);

  const canChat = selectedDocument?.status === "processed";

  const fetchDocuments = async () => {
    try {
      const res = await documentAPI.list();
      setDocuments(res.data.documents);
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchDocuments();
  }, []);

  // Poll only if some document is processing
  useEffect(() => {
    const hasProcessing = documents.some(
      (doc) => doc.status === "processing"
    );

    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 4000);

    return () => clearInterval(interval);
  }, [documents]);

  // Sync selected document when documents update
  useEffect(() => {
    if (!selectedDocument) return;

    const updated = documents.find(
      (doc) => doc.documentId === selectedDocument.documentId
    );

    if (updated) {
      setSelectedDocument(updated);
    }
  }, [documents]);

  const loadChatHistory = async (documentId) => {
    setLoadingChat(true);
    try {
      const res = await chatAPI.history(documentId);
      setMessages(res.data.data?.messages || []);
    } catch (err) {
      console.error("Failed to load chat history", err);
      setMessages([]);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleDocumentClick = (doc) => {
    setSelectedDocument(doc);
    loadChatHistory(doc.documentId);

    if (window.innerWidth < 1024) {
      setTimeout(() => {
        document
          .getElementById("chat-panel")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const getDisplayFilename = (filename) => {
    if (!filename) return "Untitled";
    const parts = filename.split("_");
    if (
      parts.length > 1 &&
      parts[0].match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    ) {
      return parts.slice(1).join("_");
    }
    return filename;
  };

  const sendQuestion = async (question) => {
    if (!selectedDocument || selectedDocument.status !== "processed")
      return;

    const tempMessage = {
      question,
      answer: "Thinking...",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);

    try {
      const res = await chatAPI.ask({
        documentId: selectedDocument.documentId,
        question,
      });

      const aiAnswer = res.data.data.answer;

      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          question,
          answer: aiAnswer,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          question,
          answer: "Error generating answer. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-[#020617] py-4">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left Panel */}
            <div className="lg:col-span-4 flex flex-col gap-6">

              <div className="bg-slate-900/50 rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-2">
                  Upload Documents
                </h2>
                <UploadDocument onUploadSuccess={fetchDocuments} />
              </div>

              <div className="bg-slate-900/50 rounded-xl flex-1 overflow-hidden">
                <div className="p-4 border-b border-slate-700 text-white font-bold">
                  Document Library
                </div>

                <div className="p-4 overflow-y-auto max-h-[400px]">
                  {loading ? (
                    <p className="text-slate-400">Loading...</p>
                  ) : documents.length === 0 ? (
                    <p className="text-slate-400">
                      No documents uploaded yet.
                    </p>
                  ) : (
                    <DocumentList
                      documents={documents}
                      onDocumentClick={handleDocumentClick}
                      selectedDocument={selectedDocument}
                      hoveredDocId={hoveredDocId}
                      setHoveredDocId={setHoveredDocId}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel */}
            <div
              id="chat-panel"
              className="lg:col-span-8 flex flex-col h-[650px]"
            >
              {selectedDocument ? (
                <>
                  <div className="bg-slate-900/50 p-4 rounded-t-xl text-white">
                    <h3 className="font-bold truncate">
                      {getDisplayFilename(selectedDocument.filename)}
                    </h3>

                    {selectedDocument.status === "processed" ? (
                      <p className="text-emerald-400 text-sm">
                        Ready for analysis
                      </p>
                    ) : (
                      <p className="text-yellow-400 text-sm">
                        Processing document...
                      </p>
                    )}
                  </div>

                  <div className="flex-1 bg-slate-900/40 rounded-b-xl overflow-hidden">
                    {loadingChat && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <p className="text-white">Loading chat...</p>
                      </div>
                    )}

                    <ChatWindow
                      messages={messages}
                      onSend={sendQuestion}
                      disabled={!canChat}
                      disabledReason="Document is still processing. Please wait."
                    />
                  </div>
                </>
              ) : (
                <div className="bg-slate-900/50 rounded-xl flex items-center justify-center text-slate-400">
                  Select a document to start chatting
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}