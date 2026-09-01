import { useRef, useState } from "react";

import { documentAPI } from "../services/api";
import { formatBytes, truncateMiddle } from "../utils/format";
import Icon from "./ui/Icon";
import { useToast } from "./ui/toast-context";

const ACCEPTED_EXTENSIONS = ["pdf", "txt", "md"];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function UploadDocument({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef(null);
  // A drag over a child element fires dragleave on the parent, so a simple
  // boolean flickers. Counting enter/leave pairs keeps the state stable.
  const dragDepth = useRef(0);
  const toast = useToast();

  const selectFile = (candidate) => {
    setError("");

    if (!candidate) return;

    const extension = candidate.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError(`Only ${ACCEPTED_EXTENSIONS.join(", ").toUpperCase()} files are supported`);
      return;
    }

    if (candidate.size === 0) {
      setError("That file is empty");
      return;
    }

    // The old copy said "less than 10MB" while enforcing 5MB.
    if (candidate.size > MAX_SIZE_BYTES) {
      setError(
        `File is ${formatBytes(candidate.size)}. The maximum size is ${MAX_SIZE_MB}MB.`
      );
      return;
    }

    setFile(candidate);
  };

  const reset = () => {
    setFile(null);
    setError("");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = async () => {
    if (!file || uploading) return;

    setUploading(true);
    setError("");
    setProgress(0);

    try {
      const result = await documentAPI.upload(file, { onProgress: setProgress });
      toast.success(`"${file.name}" uploaded. Processing has started.`);
      reset();
      onUploaded?.(result);
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const onDragEnter = (event) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="animate-slideDown mb-3 flex items-start justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3"
        >
          <div className="flex items-start gap-2">
            <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
            <p className="text-xs font-medium text-rose-200">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss"
            className="text-rose-500 transition-colors hover:text-rose-300"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-all duration-200 ${
          dragging
            ? "border-indigo-400 bg-indigo-500/10"
            : file
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-slate-700 bg-white/[0.02] hover:border-indigo-500/40 hover:bg-white/[0.04]"
        }`}
      >
        {!file ? (
          <>
            <span
              className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                dragging
                  ? "scale-110 bg-gradient-to-br from-indigo-500 to-cyan-600 text-white"
                  : "border border-slate-700 bg-slate-800 text-indigo-400"
              }`}
            >
              <Icon name="upload" className="h-5 w-5" strokeWidth={1.6} />
            </span>

            <p className="text-sm font-semibold text-white">
              {dragging ? "Drop it here" : "Drag & drop a document"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PDF, TXT or MD · up to {MAX_SIZE_MB}MB
            </p>

            <input
              ref={inputRef}
              id="file-upload"
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(event) => selectFile(event.target.files?.[0])}
              className="sr-only"
            />
            <label
              htmlFor="file-upload"
              className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-900/30 transition-all hover:from-indigo-600 hover:to-cyan-700 active:scale-95"
            >
              <Icon name="uploadTray" className="h-3.5 w-3.5" />
              Browse files
            </label>
          </>
        ) : (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-3 text-left">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-slate-800">
                <Icon name="document" className="h-5 w-5 text-emerald-400" strokeWidth={1.6} />
              </span>

              <div className="min-w-0 flex-1">
                <p title={file.name} className="truncate text-xs font-semibold text-white">
                  {truncateMiddle(file.name, 32)}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  {formatBytes(file.size)}
                </p>
              </div>
            </div>

            {uploading && (
              <div className="mt-3">
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                  {progress < 100 ? `Uploading ${progress}%` : "Finishing up…"}
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={uploading}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={upload}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-900/30 transition-all hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60"
              >
                {uploading ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Icon name="uploadTray" className="h-3.5 w-3.5" />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
