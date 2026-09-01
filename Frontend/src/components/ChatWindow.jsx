import { useEffect, useLayoutEffect, useRef, useState } from "react";

import ChatMessage from "./ChatMessage";
import Icon from "./ui/Icon";
import { EmptyState } from "./ui/States";

const MAX_QUESTION_LENGTH = 1000;
const MIN_TEXTAREA_HEIGHT = 52;
const MAX_TEXTAREA_HEIGHT = 160;

const STARTERS = [
  "Summarise this document in five bullet points.",
  "What are the key findings?",
  "List any dates, figures or names mentioned.",
  "What questions does this document leave unanswered?",
];

export default function ChatWindow({
  messages = [],
  onSend,
  onRetry,
  onClear,
  isSending = false,
  disabled = false,
  disabledReason = "",
  title = "AI Assistant",
  subtitle = null,
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const pinnedToBottom = useRef(true);

  const trimmed = input.trim();
  const tooLong = trimmed.length > MAX_QUESTION_LENGTH;
  const canSend = !disabled && !isSending && trimmed.length > 0 && !tooLong;

  /* Only auto-scroll when the user is already at the bottom. Forcing it always
     yanked the view away whenever they scrolled up to re-read an answer. */
  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedToBottom.current = distanceFromBottom < 120;
  };

  useLayoutEffect(() => {
    if (pinnedToBottom.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  const resize = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(
      Math.max(element.scrollHeight, MIN_TEXTAREA_HEIGHT),
      MAX_TEXTAREA_HEIGHT
    )}px`;
  };

  useEffect(resize, [input]);

  const send = (text = input) => {
    const value = text.trim();
    if (disabled || isSending || !value || value.length > MAX_QUESTION_LENGTH) return;

    onSend(value);
    setInput("");
    pinnedToBottom.current = true;
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const statusLabel = disabled
    ? disabledReason || "Unavailable"
    : isSending
      ? "Thinking…"
      : "Ready to help";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-xl">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-slate-900/40 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-900/30">
            <Icon name="spark" className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0">
            <h3 title={title} className="truncate text-sm font-bold text-white">
              {title}
            </h3>

            {/* The document's own metadata, when the caller supplies it. Keeping
                it here avoids a second header stacked above this panel. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500 [&>span]:whitespace-nowrap">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      disabled
                        ? "bg-slate-500"
                        : isSending
                          ? "animate-ping bg-purple-400"
                          : "bg-emerald-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                      disabled
                        ? "bg-slate-500"
                        : isSending
                          ? "bg-purple-500"
                          : "bg-emerald-500"
                    }`}
                  />
                </span>
                {statusLabel}
              </span>
              {subtitle}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="hidden rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-400 sm:inline">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>

          {onClear && messages.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              title="Clear this conversation"
              className="rounded-lg border border-white/5 bg-white/5 p-1.5 text-slate-400 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400"
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <EmptyState
              icon="chat"
              title="Start a conversation"
              message={
                disabled
                  ? disabledReason
                  : "Ask anything about this document. Every answer cites the passages it came from."
              }
            />

            {!disabled && (
              <div className="mt-1 flex w-full max-w-lg flex-wrap justify-center gap-2 px-4">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => send(starter)}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-white"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((message, index) => (
            <ChatMessage
              key={message.messageId ?? message._id ?? `${index}-${message.createdAt}`}
              message={message}
              onRetry={onRetry}
            />
          ))
        )}
        <div ref={endRef} className="h-px" />
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-white/5 bg-slate-900/40 p-4">
        <div className="flex items-end gap-2.5">
          <div className="group relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || isSending}
              rows={1}
              aria-label="Ask a question about this document"
              placeholder={
                disabled
                  ? disabledReason || "Unavailable right now"
                  : "Ask a question…  (Enter to send, Shift+Enter for a new line)"
              }
              className={`custom-scrollbar w-full resize-none rounded-xl border bg-slate-800/60 px-4 py-3.5 text-sm text-white placeholder-slate-500 shadow-sm transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                tooLong
                  ? "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-700 focus:border-purple-500 focus:ring-purple-500/20"
              }`}
              style={{ minHeight: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT }}
            />

            {trimmed.length > MAX_QUESTION_LENGTH * 0.8 && (
              <span
                className={`absolute bottom-2 right-3 text-[10px] font-semibold ${
                  tooLong ? "text-rose-400" : "text-slate-500"
                }`}
              >
                {trimmed.length}/{MAX_QUESTION_LENGTH}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => send()}
            disabled={!canSend}
            aria-label="Send question"
            className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-900/30 transition-all hover:from-purple-600 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {isSending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Icon name="send" className="h-5 w-5" />
            )}
          </button>
        </div>

        {tooLong && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-400">
            Questions are limited to {MAX_QUESTION_LENGTH} characters.
          </p>
        )}
      </div>
    </div>
  );
}
