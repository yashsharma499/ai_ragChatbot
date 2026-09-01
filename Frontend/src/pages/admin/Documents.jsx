import { useCallback, useEffect, useMemo, useState } from "react";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Icon from "../../components/ui/Icon";
import { EmptyState, ErrorState, Skeleton, StatusBadge } from "../../components/ui/States";
import { useToast } from "../../components/ui/toast-context";
import { adminAPI } from "../../services/api";
import {
  displayFilename,
  formatBytes,
  formatDateTime,
  initials,
  percent,
} from "../../utils/format";
import {
  AdminShell,
  Pagination,
  Panel,
  RefreshButton,
  SearchInput,
  StatCard,
} from "./AdminShell";

const PAGE_SIZE = 20;
const STATUS_TABS = ["all", "processed", "processing", "failed"];

export default function AdminDocuments() {
  const [documents, setDocuments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [access, setAccess] = useState("all");
  const [page, setPage] = useState(1);

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const toast = useToast();

  // Debounced so typing does not fire a request per keystroke.
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
      const result = await adminAPI.documents({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
      });

      setDocuments(result.documents ?? []);
      setPagination(result.pagination ?? { page, limit: PAGE_SIZE, total: 0 });
      setError("");
    } catch (err) {
      setError(err.message || "Could not load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  /* Enabled/disabled is filtered client-side within the current page, so the
     counts describe what is on screen rather than the whole collection. */
  const visible = useMemo(() => {
    if (access === "all") return documents;
    return documents.filter((doc) =>
      access === "enabled" ? doc.enabled : !doc.enabled
    );
  }, [documents, access]);

  const stats = useMemo(
    () => ({
      total: documents.length,
      enabled: documents.filter((doc) => doc.enabled).length,
      disabled: documents.filter((doc) => !doc.enabled).length,
    }),
    [documents]
  );

  const applyToggle = async (doc) => {
    try {
      const result = await adminAPI.toggleDocument(doc._id);
      setDocuments((current) =>
        current.map((row) =>
          row._id === doc._id ? { ...row, enabled: result.enabled } : row
        )
      );
      toast.success(
        `"${displayFilename(doc.filename)}" ${result.enabled ? "enabled" : "disabled"}`
      );
    } catch (err) {
      toast.error(err.message || "Could not change that document");
    }
  };

  const requestToggle = (doc) => {
    // Disabling cuts a user off from their own document, so confirm it.
    // Re-enabling is harmless and applies immediately.
    if (!doc.enabled) {
      applyToggle(doc);
      return;
    }

    setConfirm({
      doc,
      title: "Disable this document?",
      message: `${doc.userEmail} will no longer be able to ask questions about "${displayFilename(
        doc.filename
      )}" until it is enabled again.`,
    });
  };

  const runConfirm = async () => {
    setConfirmBusy(true);
    await applyToggle(confirm.doc);
    setConfirmBusy(false);
    setConfirm(null);
  };

  const hasFilters = Boolean(search) || status !== "all" || access !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setAccess("all");
    setPage(1);
  };

  return (
    <AdminShell
      glow="blue"
      title="Document management"
      subtitle="Review every uploaded file and control who can query it."
      actions={<RefreshButton onClick={load} busy={loading} />}
    >
      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <StatCard
          label="On this page"
          value={stats.total}
          icon="file"
          accent="blue"
          hint={`${pagination.total} total across all pages`}
        />
        <StatCard
          label="Enabled"
          value={stats.enabled}
          icon="check"
          accent="emerald"
          delay={0.05}
          // percent() guards the divide-by-zero that produced "NaN%".
          hint={`${percent(stats.enabled, stats.total).toFixed(0)}% available`}
        />
        <StatCard
          label="Disabled"
          value={stats.disabled}
          icon="slash"
          accent="rose"
          delay={0.1}
          hint="Restricted from their owners"
        />
      </div>

      <Panel className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by filename…"
            className="flex-1"
          />

          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/50 p-1">
              {STATUS_TABS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setStatus(item);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    status === item
                      ? "bg-blue-500 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/50 p-1">
              {["all", "enabled", "disabled"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAccess(item)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    access === item
                      ? item === "disabled"
                        ? "bg-rose-500 text-white"
                        : item === "enabled"
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-600 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="document"
            title="No documents found"
            message={
              hasFilters
                ? "Try adjusting your search or filters."
                : "Nothing has been uploaded yet."
            }
            action={
              hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white/10"
                >
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="custom-scrollbar hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead className="border-b border-white/5 bg-white/[0.02]">
                  <tr>
                    {["Document", "Owner", "Status", "Access", ""].map((header, index) => (
                      <th
                        key={header || index}
                        className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5">
                  {visible.map((doc) => (
                    <tr
                      key={doc._id}
                      className="group transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-800 transition-colors group-hover:border-blue-500/30">
                            <Icon
                              name="document"
                              className="h-5 w-5 text-slate-400 transition-colors group-hover:text-blue-400"
                            />
                          </span>
                          <div className="min-w-0">
                            <p
                              title={displayFilename(doc.filename)}
                              className="max-w-[16rem] truncate text-sm font-bold text-white"
                            >
                              {displayFilename(doc.filename)}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">
                              {formatDateTime(doc.createdAt)}
                              {doc.size > 0 && ` · ${formatBytes(doc.size)}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-bold text-white">
                            {/* The old code called .slice() straight on
                                userEmail and crashed on orphaned rows. */}
                            {initials(doc.userEmail)}
                          </span>
                          <span className="text-sm font-medium text-slate-300">
                            {doc.userEmail || "Unknown"}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge status={doc.status} />
                        {doc.status === "failed" && doc.error && (
                          <p
                            title={doc.error}
                            className="mt-1 max-w-[14rem] truncate text-[11px] text-rose-400/80"
                          >
                            {doc.error}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge
                          status={doc.enabled ? "processed" : "disabled"}
                          label={doc.enabled ? "Enabled" : "Disabled"}
                        />
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => requestToggle(doc)}
                          className={`rounded-lg border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                            doc.enabled
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          }`}
                        >
                          {doc.enabled ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 p-4 lg:hidden">
              {visible.map((doc) => (
                <div
                  key={doc._id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-800">
                      <Icon name="document" className="h-5 w-5 text-blue-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {displayFilename(doc.filename)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(doc.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <StatusBadge status={doc.status} />
                        <StatusBadge
                          status={doc.enabled ? "processed" : "disabled"}
                          label={doc.enabled ? "Enabled" : "Disabled"}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 p-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-[9px] font-bold text-indigo-300">
                      {initials(doc.userEmail)}
                    </span>
                    <p className="truncate text-xs text-slate-300">
                      {doc.userEmail || "Unknown"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => requestToggle(doc)}
                    className={`w-full rounded-lg border py-2 text-xs font-bold uppercase tracking-wider ${
                      doc.enabled
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {doc.enabled ? "Disable document" : "Enable document"}
                  </button>
                </div>
              ))}
            </div>

            <Pagination
              page={pagination.page}
              limit={pagination.limit}
              total={pagination.total}
              onChange={setPage}
            />
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel="Disable"
        destructive
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </AdminShell>
  );
}
