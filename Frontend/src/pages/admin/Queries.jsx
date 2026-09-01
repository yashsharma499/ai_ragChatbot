import { useCallback, useEffect, useState } from "react";

import Icon from "../../components/ui/Icon";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/States";
import { adminAPI } from "../../services/api";
import { formatDateTime, formatRelative, initials } from "../../utils/format";
import {
  AdminShell,
  Pagination,
  Panel,
  RefreshButton,
  SearchInput,
} from "./AdminShell";

const PAGE_SIZE = 20;

function QueryCard({ query }) {
  const [expanded, setExpanded] = useState(false);
  const answer = query.answer ?? "";
  const isLong = answer.length > 420;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-xl transition-colors hover:border-purple-500/25">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-xs font-bold text-white shadow-lg shadow-purple-900/30">
            {initials(query.userEmail)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {query.userEmail || "Unknown user"}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Icon name="clock" className="h-3 w-3" />
              <span title={formatDateTime(query.createdAt)}>
                {formatRelative(query.createdAt)}
              </span>
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 p-5">
        <div className="flex gap-3.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
            <Icon name="question" className="h-4 w-4 text-blue-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-blue-400">
              Question
            </p>
            <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-sm font-medium leading-relaxed text-slate-200">
              {query.question}
            </p>
          </div>
        </div>

        <div className="flex gap-3.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10">
            <Icon name="spark" className="h-4 w-4 text-purple-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
              AI response
            </p>
            {/* Long answers used to render in full and made every row a
                different height, so the log was hard to scan. */}
            <p
              className={`whitespace-pre-wrap border-l-2 border-purple-500/25 pl-4 text-sm leading-relaxed text-slate-300 ${
                !expanded && isLong ? "line-clamp-5" : ""
              }`}
            >
              {answer}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="mt-2 pl-4 text-[11px] font-semibold text-purple-400 transition-colors hover:text-purple-300"
              >
                {expanded ? "Show less" : "Show full answer"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AdminQueries() {
  const [queries, setQueries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminAPI.queries({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
      });

      // The old code assigned the raw response, which could be undefined and
      // then threw on `.filter` during render.
      setQueries(result.queries ?? []);
      setPagination(result.pagination ?? { page, limit: PAGE_SIZE, total: 0 });
      setError("");
    } catch (err) {
      setError(err.message || "Could not load queries");
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell
      glow="purple"
      title="User queries"
      subtitle="Every question asked across the platform, newest first."
      actions={
        <>
          <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2.5 text-center backdrop-blur-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Total
            </p>
            <p className="text-lg font-bold leading-tight text-white">
              {pagination.total}
            </p>
          </div>
          <RefreshButton onClick={load} busy={loading} />
        </>
      }
    >
      <Panel className="mb-5 p-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search questions and answers…"
        />
      </Panel>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-52 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Panel>
          <ErrorState message={error} onRetry={load} />
        </Panel>
      ) : queries.length === 0 ? (
        <Panel>
          <EmptyState
            icon="chat"
            title="No queries found"
            message={
              debouncedSearch
                ? `Nothing matches "${debouncedSearch}".`
                : "No questions have been asked yet."
            }
          />
        </Panel>
      ) : (
        <>
          <div className="space-y-4">
            {queries.map((query) => (
              <QueryCard key={query._id} query={query} />
            ))}
          </div>

          <Panel className="mt-5">
            <Pagination
              page={pagination.page}
              limit={pagination.limit}
              total={pagination.total}
              onChange={setPage}
            />
          </Panel>
        </>
      )}
    </AdminShell>
  );
}
