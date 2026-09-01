import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Icon from "../../components/ui/Icon";
import { ErrorState, Skeleton } from "../../components/ui/States";
import { adminAPI, healthAPI } from "../../services/api";
import { formatNumber } from "../../utils/format";
import { AdminShell, RefreshButton, StatCard } from "./AdminShell";

const NAV_CARDS = [
  {
    to: "/admin/users",
    title: "Users",
    description: "Browse accounts and inspect each user's documents and queries.",
    icon: "users",
    accent: "from-emerald-500 to-teal-600",
    iconBg: "bg-emerald-500/10 text-emerald-400",
    border: "hover:border-emerald-500/40",
    stat: (stats) => `${stats.totalUsers ?? 0} total`,
  },
  {
    to: "/admin/documents",
    title: "Documents",
    description: "Review every uploaded file and enable or disable access.",
    icon: "document",
    accent: "from-blue-500 to-indigo-600",
    iconBg: "bg-blue-500/10 text-blue-400",
    border: "hover:border-blue-500/40",
    stat: (stats) => `${stats.activeDocuments ?? 0} active`,
  },
  {
    to: "/admin/queries",
    title: "Queries",
    description: "Read the full question and answer log across all users.",
    icon: "chat",
    accent: "from-purple-500 to-pink-600",
    iconBg: "bg-purple-500/10 text-purple-400",
    border: "hover:border-purple-500/40",
    stat: (stats) => `${stats.queriesToday ?? 0} today`,
  },
  {
    to: "/admin/usage",
    title: "Usage",
    description: "Track token consumption per account.",
    icon: "chart",
    accent: "from-amber-500 to-orange-600",
    iconBg: "bg-amber-500/10 text-amber-400",
    border: "hover:border-amber-500/40",
    stat: (stats) => `${formatNumber(stats.totalTokens ?? 0)} tokens`,
  },
];

function GrowthHint({ percent }) {
  if (typeof percent !== "number") return null;

  const positive = percent >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${
        positive ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      <Icon
        name="chevronRight"
        className={`h-3 w-3 ${positive ? "-rotate-90" : "rotate-90"}`}
        strokeWidth={3}
      />
      {positive ? "+" : ""}
      {percent}% vs last week
    </span>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResult, healthResult] = await Promise.allSettled([
        adminAPI.stats(),
        healthAPI.check(),
      ]);

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value ?? {});
        setError("");
      } else {
        setError(statsResult.reason?.message || "Could not load dashboard statistics");
      }

      // Health is informational; its failure must not blank the page.
      setHealth(healthResult.status === "fulfilled" ? healthResult.value : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const degraded = health && health.status !== "ok";

  return (
    <AdminShell
      title={
        <>
          Admin{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Dashboard
          </span>
        </>
      }
      subtitle="System overview across all users, documents and activity."
      actions={<RefreshButton onClick={load} busy={loading} />}
    >
      {degraded && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <Icon name="warning" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-semibold text-amber-200">Service running in degraded mode</p>
            <p className="mt-0.5 text-amber-200/70">
              {health.database !== "connected" && "The database is unreachable. "}
              {health.missingConfig?.length > 0 &&
                `Missing configuration: ${health.missingConfig.join(", ")}.`}
            </p>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="mb-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              [0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-[118px] w-full rounded-2xl" />
              ))
            ) : (
              <>
                <StatCard
                  label="Total users"
                  value={stats.totalUsers ?? 0}
                  icon="users"
                  accent="emerald"
                  // Replaces the hardcoded "+12% vs last week" placeholder.
                  hint={<GrowthHint percent={stats.userGrowthPercent} />}
                />
                <StatCard
                  label="Active documents"
                  value={stats.activeDocuments ?? 0}
                  icon="document"
                  accent="blue"
                  delay={0.05}
                  hint={`of ${stats.totalDocuments ?? 0} total${
                    stats.failedDocuments ? ` · ${stats.failedDocuments} failed` : ""
                  }`}
                />
                <StatCard
                  label="Queries today"
                  value={stats.queriesToday ?? 0}
                  icon="chat"
                  accent="purple"
                  delay={0.1}
                  hint={`${stats.queriesThisWeek ?? 0} this week · ${
                    stats.totalQueries ?? 0
                  } all time`}
                />
                <StatCard
                  label="Tokens used"
                  value={formatNumber(stats.totalTokens ?? 0)}
                  icon="bolt"
                  accent="amber"
                  delay={0.15}
                  hint="Embedding and generation combined"
                />
              </>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {NAV_CARDS.map((card, index) => (
              <Link
                key={card.to}
                to={card.to}
                className={`animate-slideUp group relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${card.border}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span
                  className={`pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br ${card.accent} opacity-10 blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:opacity-20`}
                />

                <div className="relative flex h-full flex-col p-5">
                  <span
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 transition-transform duration-300 group-hover:scale-110 ${card.iconBg}`}
                  >
                    <Icon name={card.icon} className="h-6 w-6" />
                  </span>

                  <h2 className="text-base font-bold text-white">{card.title}</h2>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">
                    {card.description}
                  </p>

                  <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-3.5">
                    <span className="rounded-lg bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-300">
                      {loading ? "…" : card.stat(stats)}
                    </span>
                    <Icon
                      name="arrowRight"
                      className="h-4 w-4 text-slate-500 transition-all group-hover:translate-x-1 group-hover:text-white"
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AdminShell>
  );
}
