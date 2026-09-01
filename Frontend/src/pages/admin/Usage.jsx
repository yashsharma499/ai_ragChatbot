import { useCallback, useEffect, useMemo, useState } from "react";

import Icon from "../../components/ui/Icon";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/States";
import { adminAPI } from "../../services/api";
import { formatDateTime, formatNumber, initials, percent } from "../../utils/format";
import { AdminShell, Panel, RefreshButton, StatCard } from "./AdminShell";

const SORTS = [
  { id: "tokens", label: "Tokens" },
  { id: "requests", label: "Requests" },
  { id: "user", label: "User" },
];

const RANK_STYLES = [
  "bg-gradient-to-br from-amber-400 to-yellow-600 text-white",
  "bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900",
  "bg-gradient-to-br from-orange-400 to-orange-600 text-white",
];

export default function AdminUsage() {
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("tokens");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminAPI.usage();
      setUsage(Array.isArray(result.usage) ? result.usage : []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load usage data");
      setUsage([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const tokens = usage.reduce((sum, row) => sum + (row.tokens || 0), 0);
    const requests = usage.reduce((sum, row) => sum + (row.requests || 0), 0);
    const generation = usage.reduce((sum, row) => sum + (row.generationTokens || 0), 0);

    return {
      tokens,
      requests,
      generation,
      average: usage.length ? Math.round(tokens / usage.length) : 0,
      peak: usage.length ? Math.max(...usage.map((row) => row.tokens || 0)) : 0,
    };
  }, [usage]);

  const sorted = useMemo(() => {
    const rows = [...usage];
    if (sortBy === "user") {
      return rows.sort((a, b) => (a.userEmail || "").localeCompare(b.userEmail || ""));
    }
    if (sortBy === "requests") {
      return rows.sort((a, b) => (b.requests || 0) - (a.requests || 0));
    }
    return rows.sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
  }, [usage, sortBy]);

  return (
    <AdminShell
      glow="amber"
      title="Token analytics"
      subtitle="Embedding and generation consumption per account."
      actions={<RefreshButton onClick={load} busy={loading} />}
    >
      <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total tokens"
          value={formatNumber(totals.tokens)}
          icon="bolt"
          accent="blue"
          hint={`${formatNumber(totals.generation)} from generation`}
        />
        <StatCard
          label="Requests"
          value={formatNumber(totals.requests)}
          icon="chat"
          accent="purple"
          delay={0.05}
          hint="Embedding and completion calls"
        />
        <StatCard
          label="Average per user"
          value={formatNumber(totals.average)}
          icon="chart"
          accent="emerald"
          delay={0.1}
          hint={`Across ${usage.length} account${usage.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Peak usage"
          value={formatNumber(totals.peak)}
          icon="cpu"
          accent="amber"
          delay={0.15}
          hint="Highest single account"
        />
      </div>

      <div className="mb-5 flex items-center justify-end gap-2">
        <span className="text-xs font-medium text-slate-500">Sort by</span>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-900/50 p-1 backdrop-blur-md">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              type="button"
              onClick={() => setSortBy(sort.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                sortBy === sort.id
                  ? "bg-amber-500 text-white shadow-lg shadow-amber-900/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </div>

      <Panel>
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="chart"
            title="No usage recorded"
            message="Token usage appears here once documents are processed and questions are asked."
          />
        ) : (
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  {["Rank", "Account", "Tokens", "Requests", "Share of peak"].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {sorted.map((row, index) => {
                  const share = percent(row.tokens, totals.peak);
                  const showMedal = sortBy === "tokens" && index < 3;

                  return (
                    <tr
                      key={row.userId ?? row.userEmail ?? index}
                      className="group transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-transform group-hover:scale-110 ${
                            showMedal
                              ? RANK_STYLES[index]
                              : "border border-white/10 bg-slate-800 text-slate-400"
                          }`}
                        >
                          {index + 1}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
                            {initials(row.userEmail)}
                          </span>
                          <div className="min-w-0">
                            {/* The old table fell back to showing a raw Mongo
                                id because the API never returned an email. */}
                            <p className="truncate text-sm font-bold text-slate-200 group-hover:text-white">
                              {row.userEmail || "Unknown user"}
                            </p>
                            {row.lastUsedAt && (
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                Last active {formatDateTime(row.lastUsedAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-mono text-base font-bold text-white">
                          {formatNumber(row.tokens)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {formatNumber(row.generationTokens || 0)} gen ·{" "}
                          {formatNumber(row.embeddingTokens || 0)} embed
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          <Icon name="bolt" className="h-3 w-3 text-amber-400" />
                          {formatNumber(row.requests || 0)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                          <p className="mb-1.5 text-[10px] font-bold text-slate-500">
                            {share.toFixed(1)}% of top user
                          </p>
                          <div className="h-2 w-full overflow-hidden rounded-full border border-white/5 bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-600 transition-all duration-500"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
