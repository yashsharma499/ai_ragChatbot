import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { formatTime } from "../utils/format";
import Icon from "./ui/Icon";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is blocked outside secure contexts; fail quietly.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Answer copied" : "Copy answer"}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 opacity-0 transition-all hover:bg-white/5 hover:text-slate-300 focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Icon name={copied ? "check" : "copy"} className="h-3 w-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;

  return (
    <div className="mt-3 border-t border-white/5 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:text-indigo-300"
      >
        <Icon
          name="chevronRight"
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {sources.length} source{sources.length === 1 ? "" : "s"} from this document
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {sources.map((source) => (
            <li
              key={source.index}
              className="rounded-lg border border-white/5 bg-slate-950/40 p-2.5"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                  [{source.index}]
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  Passage {source.chunkIndex + 1}
                  {typeof source.score === "number" &&
                    ` · ${Math.round(source.score * 100)}% match`}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {source.excerpt}
                {source.excerpt?.length >= 280 && "…"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MARKDOWN_COMPONENTS = {
  // Keeps a wide table inside its bubble instead of stretching the layout.
  table: ({ children, ...props }) => (
    <div className="table-scroll custom-scrollbar">
      <table {...props}>{children}</table>
    </div>
  ),
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

function ChatMessage({ message, onRetry }) {
  const { question, answer, sources, createdAt, pending, failed } = message;

  return (
    <div className="space-y-4">
      {/* Question */}
      <div className="group flex justify-end">
        <div className="flex max-w-[85%] items-end gap-2.5 md:max-w-[75%]">
          <div className="flex flex-col items-end">
            <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-blue-500 to-cyan-600 px-4 py-3 shadow-lg shadow-blue-900/30">
              <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-white">
                {question}
              </p>
            </div>
            {createdAt && (
              <p className="mt-1 text-[11px] font-medium text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                {formatTime(createdAt)}
              </p>
            )}
          </div>

          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
            <Icon name="user" className="h-4 w-4 text-slate-400" />
          </span>
        </div>
      </div>

      {/* Answer */}
      <div className="group flex justify-start">
        <div className="flex w-full max-w-[92%] items-start gap-3 md:max-w-[85%]">
          <span
            className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border shadow-lg ${
              failed
                ? "border-rose-400/30 bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-900/30"
                : "border-emerald-400/30 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-900/30"
            }`}
          >
            <Icon
              name={failed ? "warning" : "spark"}
              className="h-4 w-4 text-white"
            />
          </span>

          <div className="min-w-0 flex-1">
            <div
              className={`rounded-2xl rounded-tl-md border px-4 py-3 shadow-lg ${
                failed
                  ? "border-rose-500/20 bg-rose-500/5"
                  : "border-slate-700/50 bg-slate-800/60"
              }`}
            >
              {pending ? (
                // A real pending state, rather than writing the literal string
                // "Thinking..." into the answer body.
                <div className="flex items-center gap-2 py-1" aria-label="Generating answer">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400" />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-purple-400"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-purple-400"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <span className="ml-1.5 text-xs font-medium text-slate-500">
                    Searching your document…
                  </span>
                </div>
              ) : (
                <>
                  <div className="markdown-body">
                    <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                      {answer || ""}
                    </ReactMarkdown>
                  </div>
                  <Sources sources={sources} />
                </>
              )}
            </div>

            {!pending && (
              <div className="mt-1 flex items-center gap-1">
                {createdAt && (
                  <span className="px-1 text-[11px] font-medium text-slate-600 opacity-0 transition-opacity group-hover:opacity-100">
                    {formatTime(createdAt)}
                  </span>
                )}
                {failed && onRetry ? (
                  <button
                    type="button"
                    onClick={() => onRetry(question)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Icon name="refresh" className="h-3 w-3" />
                    Retry
                  </button>
                ) : (
                  answer && <CopyButton text={answer} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Chat history grows without bound; re-rendering every bubble on each keystroke
// in the composer is wasteful.
export default memo(ChatMessage);
