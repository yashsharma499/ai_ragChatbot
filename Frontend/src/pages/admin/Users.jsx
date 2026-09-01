import { useCallback, useEffect, useMemo, useState } from "react";

import Icon from "../../components/ui/Icon";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
  StatusBadge,
} from "../../components/ui/States";
import { useToast } from "../../components/ui/toast-context";
import { adminAPI } from "../../services/api";
import { displayFilename, formatDate, formatDateTime, initials } from "../../utils/format";
import { AdminShell, Panel, RefreshButton, SearchInput } from "./AdminShell";

const ROLE_FILTERS = [
  { id: "all", label: "All" },
  { id: "user", label: "Members" },
  { id: "admin", label: "Admins" },
];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [selected, setSelected] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [queries, setQueries] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState("documents");

  const toast = useToast();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminAPI.users();
      setUsers(Array.isArray(list) ? list : []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadDetail = useCallback(async (user) => {
    setLoadingDetail(true);
    try {
      // Fetched together so switching tabs never shows a second spinner.
      const [docsResult, queriesResult] = await Promise.allSettled([
        adminAPI.userDocuments(user._id),
        adminAPI.userQueries(user._id, { limit: 50 }),
      ]);

      setDocuments(
        docsResult.status === "fulfilled" ? (docsResult.value?.documents ?? []) : []
      );
      setQueries(
        queriesResult.status === "fulfilled" ? (queriesResult.value?.queries ?? []) : []
      );
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const selectUser = (user) => {
    setSelected(user);
    setTab("documents");
    loadDetail(user);
  };

  const toggleDocument = async (doc) => {
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
      // The old version showed a bare alert() with no detail.
      toast.error(err.message || "Could not change that document");
    }
  };

  /* The old list counted every user in the header but rendered only members,
     so the two numbers disagreed. Filtering happens in one place now. */
  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || (user.role ?? "user") === roleFilter;
      const matchesSearch =
        !term ||
        user.email?.toLowerCase().includes(term) ||
        user.name?.toLowerCase().includes(term);
      return matchesRole && matchesSearch;
    });
  }, [users, search, roleFilter]);

  return (
    <AdminShell
      title="User management"
      subtitle="Inspect accounts, their uploaded documents and their query history."
      actions={<RefreshButton onClick={loadUsers} busy={loading} />}
    >
      <div className="grid gap-5 lg:grid-cols-12">
        {/* User list */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Panel className="flex h-[calc(100vh-15rem)] min-h-[30rem] flex-col">
            <div className="space-y-3 border-b border-white/5 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                  Users
                </h2>
                <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                  {visibleUsers.length} shown
                </span>
              </div>

              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search name or email…"
              />

              <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/50 p-1">
                {ROLE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setRoleFilter(filter.id)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      roleFilter === filter.id
                        ? "bg-indigo-500 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
              {loading ? (
                <div className="space-y-2 p-1">
                  {[0, 1, 2, 3].map((key) => (
                    <Skeleton key={key} className="h-[60px] w-full rounded-xl" />
                  ))}
                </div>
              ) : error ? (
                <ErrorState message={error} onRetry={loadUsers} className="py-10" />
              ) : visibleUsers.length === 0 ? (
                <EmptyState
                  icon="users"
                  title="No users found"
                  message={search ? `Nothing matches "${search}".` : "No accounts yet."}
                  className="py-10"
                />
              ) : (
                visibleUsers.map((user) => {
                  const isSelected = selected?._id === user._id;
                  const isAdmin = user.role === "admin";

                  return (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => selectUser(user)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-indigo-500/30 bg-indigo-500/10"
                          : "border-transparent hover:border-white/5 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-lg ${
                          isAdmin
                            ? "bg-gradient-to-br from-rose-500 to-red-600"
                            : "bg-gradient-to-br from-indigo-500 to-blue-600"
                        }`}
                      >
                        {initials(user.email)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p
                          title={user.email}
                          className={`truncate text-sm font-semibold ${
                            isSelected ? "text-white" : "text-slate-300"
                          }`}
                        >
                          {user.email}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {user.documentCount} docs · {user.queryCount} queries
                        </p>
                      </div>

                      {isAdmin && (
                        <span
                          title="Administrator"
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500"
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Detail */}
        <div className="lg:col-span-8 xl:col-span-9">
          <Panel className="flex h-[calc(100vh-15rem)] min-h-[30rem] flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon="users"
                  title="Select a user"
                  message="Choose an account from the list to see its documents and query history."
                />
              </div>
            ) : (
              <>
                <div className="border-b border-white/5 bg-white/[0.02] px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <span
                        className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-xl ${
                          selected.role === "admin"
                            ? "bg-gradient-to-br from-rose-500 to-pink-600"
                            : "bg-gradient-to-br from-indigo-500 to-violet-600"
                        }`}
                      >
                        {initials(selected.email)}
                      </span>

                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-bold tracking-tight text-white">
                          {selected.name || selected.email}
                        </h2>
                        {selected.name && (
                          <p className="truncate text-sm text-slate-400">{selected.email}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              selected.role === "admin"
                                ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {selected.role === "admin" ? "Administrator" : "Member"}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Icon name="calendar" className="h-3 w-3" />
                            Joined {formatDate(selected.createdAt)}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Icon name="clock" className="h-3 w-3" />
                            {selected.lastLogin
                              ? `Last seen ${formatDateTime(selected.lastLogin)}`
                              : "Never signed in"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Docs
                        </p>
                        <p className="text-xl font-bold text-white">
                          {selected.documentCount}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Queries
                        </p>
                        <p className="text-xl font-bold text-white">{selected.queryCount}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex border-b border-white/5 bg-white/[0.02] px-4">
                  {[
                    { id: "documents", label: "Documents", icon: "document", count: documents.length },
                    { id: "queries", label: "Query history", icon: "chat", count: queries.length },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                        tab === item.id
                          ? "text-indigo-400"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Icon name={item.icon} className="h-4 w-4" />
                      {item.label}
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold">
                        {item.count}
                      </span>
                      {tab === item.id && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-500" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
                  {loadingDetail ? (
                    <LoadingState message="Fetching account data…" />
                  ) : tab === "documents" ? (
                    documents.length === 0 ? (
                      <EmptyState
                        icon="document"
                        title="No documents"
                        message="This user has not uploaded anything yet."
                      />
                    ) : (
                      <ul className="space-y-2.5">
                        {documents.map((doc) => (
                          <li
                            key={doc._id}
                            className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-indigo-500/25 hover:bg-white/[0.04]"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3.5">
                              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-800">
                                <Icon name="document" className="h-5 w-5 text-indigo-400" />
                              </span>

                              <div className="min-w-0">
                                <p
                                  title={doc.displayName ?? doc.filename}
                                  className="truncate text-sm font-semibold text-slate-200 group-hover:text-white"
                                >
                                  {doc.displayName ?? displayFilename(doc.filename)}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <StatusBadge
                                    status={doc.enabled === false ? "disabled" : doc.status}
                                  />
                                  <span className="text-[11px] font-medium text-slate-500">
                                    {formatDate(doc.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleDocument(doc)}
                              className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                                doc.enabled
                                  ? "border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                              }`}
                            >
                              {doc.enabled ? "Disable" : "Enable"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : queries.length === 0 ? (
                    <EmptyState
                      icon="chat"
                      title="No queries"
                      message="This user has not asked anything yet."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {queries.map((query) => (
                        <li
                          key={query._id}
                          className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:border-indigo-500/20"
                        >
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                            Question
                          </p>
                          <p className="text-sm font-medium leading-relaxed text-slate-200">
                            {query.question}
                          </p>

                          <p className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-widest text-purple-400">
                            Answer
                          </p>
                          <p className="whitespace-pre-wrap border-l-2 border-purple-500/25 pl-4 text-sm leading-relaxed text-slate-400">
                            {query.answer}
                          </p>

                          <p className="mt-4 border-t border-white/5 pt-3 text-right text-[10px] font-medium text-slate-600">
                            {formatDateTime(query.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </AdminShell>
  );
}
