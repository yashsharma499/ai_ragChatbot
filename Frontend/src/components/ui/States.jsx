import Icon from "./Icon";

export function Spinner({ className = "h-5 w-5", label }) {
  return (
    <span
      role="status"
      aria-label={label || "Loading"}
      className={`inline-block animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500 ${className}`}
    />
  );
}

export function LoadingState({ message = "Loading…", className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}
    >
      <Spinner className="h-9 w-9" />
      <p className="text-sm font-medium text-slate-400">{message}</p>
    </div>
  );
}

export function EmptyState({ icon = "document", title, message, action, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
    >
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/5 bg-white/5">
        <Icon name={icon} className="h-7 w-7 text-slate-500" strokeWidth={1.5} />
      </span>
      <h3 className="text-base font-bold text-white">{title}</h3>
      {message && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">{message}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
    >
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
        <Icon name="warning" className="h-7 w-7 text-rose-400" strokeWidth={1.5} />
      </span>
      <h3 className="text-base font-bold text-white">Something went wrong</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          <Icon name="refresh" className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

const STATUS_STYLES = {
  processed: {
    label: "Ready",
    dot: "bg-emerald-400",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    pulse: false,
  },
  processing: {
    label: "Processing",
    dot: "bg-amber-400",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    pulse: true,
  },
  failed: {
    label: "Failed",
    dot: "bg-rose-400",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    pulse: false,
  },
  disabled: {
    label: "Disabled",
    dot: "bg-slate-500",
    className: "border-white/10 bg-white/5 text-slate-400",
    pulse: false,
  },
};

export function StatusBadge({ status, label, className = "" }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.processing;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.className} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${style.dot} ${
          style.pulse ? "animate-pulse" : ""
        }`}
      />
      {label ?? style.label}
    </span>
  );
}
