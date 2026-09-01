import {
  displayFilename,
  fileExtension,
  formatBytes,
  formatRelative,
} from "../utils/format";
import Icon from "./ui/Icon";
import { StatusBadge } from "./ui/States";

function FileIcon({ filename }) {
  const isPdf = fileExtension(filename) === "pdf";

  return (
    <span
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 shadow-sm ${
        isPdf
          ? "bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-900/20"
          : "bg-gradient-to-br from-slate-600 to-slate-700"
      }`}
    >
      <Icon name={isPdf ? "file" : "document"} className="h-4 w-4 text-white" />
    </span>
  );
}

export default function DocumentList({
  documents = [],
  selectedId,
  onSelect,
  onDelete,
}) {
  return (
    <ul className="space-y-2">
      {documents.map((doc) => {
        const id = doc.documentId ?? doc._id;
        const isSelected = selectedId === id;
        const name = displayFilename(doc.filename);
        const status = doc.enabled === false ? "disabled" : doc.status;

        return (
          <li key={id}>
            <div
              className={`group relative rounded-xl border transition-all duration-200 ${
                isSelected
                  ? "border-indigo-500/50 bg-gradient-to-r from-indigo-500/15 to-cyan-500/5 shadow-md shadow-indigo-900/20"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(doc)}
                aria-current={isSelected || undefined}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <FileIcon filename={name} />

                <div className="min-w-0 flex-1">
                  <p
                    title={name}
                    className={`truncate pr-6 text-sm font-semibold ${
                      isSelected ? "text-white" : "text-slate-200 group-hover:text-white"
                    }`}
                  >
                    {name}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusBadge status={status} />

                    <span className="text-[11px] font-medium text-slate-500">
                      {formatRelative(doc.createdAt)}
                    </span>

                    {doc.size > 0 && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {formatBytes(doc.size)}
                        </span>
                      </>
                    )}

                    {doc.status === "processed" && doc.totalChunks > 0 && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {doc.totalChunks}{" "}
                          {doc.totalChunks === 1 ? "passage" : "passages"}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Surfacing the reason a document failed, instead of leaving
                      it as a status the user cannot act on. */}
                  {doc.status === "failed" && doc.error && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-rose-400/90">
                      {doc.error}
                    </p>
                  )}

                  {doc.enabled === false && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      Disabled by an administrator.
                    </p>
                  )}
                </div>
              </button>

              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(doc)}
                  aria-label={`Delete ${name}`}
                  title="Delete document"
                  className="absolute right-2 top-2 rounded-md p-1.5 text-slate-500 opacity-0 transition-all hover:bg-rose-500/15 hover:text-rose-400 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
