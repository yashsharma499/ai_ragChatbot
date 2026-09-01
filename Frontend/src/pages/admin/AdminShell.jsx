import Navbar from "../../components/Navbar";
import Icon from "../../components/ui/Icon";

/** Page chrome shared by every admin screen. */
export function AdminShell({ title, subtitle, actions, children, glow = "indigo" }) {
  const glows = {
    indigo: "bg-indigo-900/10",
    blue: "bg-blue-900/10",
    purple: "bg-purple-900/10",
    amber: "bg-amber-900/10",
  };

  return (
    <>
      <Navbar />

      <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#020617] px-4 py-7 sm:px-6 lg:px-8">
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-80 blur-[120px] ${
            glows[glow] ?? glows.indigo
          }`}
        />

        <div className="relative z-10 mx-auto max-w-7xl">
          <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
          </header>

          {children}
        </div>
      </main>
    </>
  );
}

export function RefreshButton({ onClick, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
    >
      <Icon
        name="refresh"
        className={`h-4 w-4 text-indigo-400 transition-transform duration-500 ${
          busy ? "animate-spin" : "group-hover:rotate-180"
        }`}
      />
      Refresh
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-white/10 bg-slate-950/50 py-2.5 pl-10 pr-9 text-sm text-slate-200 placeholder-slate-500 transition-colors focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-white"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, accent = "indigo", delay = 0 }) {
  const accents = {
    indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-400", hover: "hover:border-indigo-500/30" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", hover: "hover:border-emerald-500/30" },
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400", hover: "hover:border-blue-500/30" },
    purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400", hover: "hover:border-purple-500/30" },
    amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", hover: "hover:border-amber-500/30" },
    rose: { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-400", hover: "hover:border-rose-500/30" },
  };
  const style = accents[accent] ?? accents.indigo;

  return (
    <div
      className={`animate-slideUp group rounded-2xl border border-white/5 bg-slate-900/50 p-5 backdrop-blur-xl transition-colors ${style.hover}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            {label}
          </p>
          <p
            className={`mt-1.5 text-3xl font-black text-white transition-colors group-hover:${style.text}`}
          >
            {value}
          </p>
          {hint && <div className="mt-2 text-[11px] font-medium text-slate-400">{hint}</div>}
        </div>

        <span
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110 ${style.bg} ${style.border}`}
        >
          <Icon name={icon} className={`h-5 w-5 ${style.text}`} />
        </span>
      </div>
    </div>
  );
}

export function Pagination({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-5 py-3.5">
      <p className="text-xs font-medium text-slate-500">
        Showing <span className="text-slate-300">{from}</span>–
        <span className="text-slate-300">{to}</span> of{" "}
        <span className="text-slate-300">{total}</span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="chevronLeft" className="h-3.5 w-3.5" />
          Previous
        </button>

        <span className="px-2 text-xs font-medium text-slate-500">
          Page {page} of {pages}
        </span>

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}
