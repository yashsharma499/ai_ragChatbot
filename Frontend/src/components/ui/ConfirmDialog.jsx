import { useEffect, useRef } from "react";
import Icon from "./Icon";

/**
 * Accessible confirmation modal used for destructive actions (deleting a
 * document, clearing a conversation, disabling a document).
 *
 * Handles Escape, backdrop clicks, initial focus and focus trapping, none of
 * which `window.confirm` gives you inside a styled app.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    confirmRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="animate-slideUp w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${
              destructive
                ? "border-rose-500/25 bg-rose-500/10 text-rose-400"
                : "border-indigo-500/25 bg-indigo-500/10 text-indigo-400"
            }`}
          >
            <Icon name={destructive ? "warning" : "question"} className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-bold text-white">
              {title}
            </h2>
            <p id="confirm-message" className="mt-1.5 text-sm leading-relaxed text-slate-400">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-60 ${
              destructive
                ? "bg-rose-600 shadow-rose-900/40 hover:bg-rose-500"
                : "bg-indigo-600 shadow-indigo-900/40 hover:bg-indigo-500"
            }`}
          >
            {busy && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
