import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminPage,
});

type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  totalAttempts: number;
  passedAttempts: number;
  passRate: number | null;
  postsPublished: number;
  lastActiveAt: string;
};

type Overview = {
  stats: {
    totalUsers: number;
    totalAttempts: number;
    overallPassRate: number;
    totalPostsPublished: number;
  };
  users: UserRow[];
};

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function NavLink({ label, icon, active, onClick }: {
  label: string; icon: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.04] font-medium"
      }`}
    >
      <span className="text-base leading-none opacity-60">{icon}</span>
      {label}
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </button>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "blue";
}) {
  const accentColor = {
    green: "oklch(0.70 0.22 145)",
    amber: "oklch(0.78 0.17 65)",
    blue: "oklch(0.65 0.18 240)",
  }[accent ?? "blue"];

  return (
    <div
      className="relative rounded-2xl border border-white/[0.07] overflow-hidden px-5 pt-5 pb-5 flex flex-col justify-between gap-4"
      style={{
        background: "linear-gradient(135deg, oklch(0.14 0.018 280 / 80%), oklch(0.10 0.010 260 / 90%))",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.06)",
      }}
    >
      {/* Arrow button */}
      <button
        className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center border border-white/10 hover:border-white/20 transition-colors"
        style={{ background: "oklch(0.18 0.012 270)" }}
      >
        <span className="text-[10px] text-muted-foreground/60">↗</span>
      </button>

      <div>
        <p className="text-[11px] font-medium text-muted-foreground/50 mb-3">{label}</p>
        <p className="text-3xl font-display font-bold text-foreground leading-none">{value}</p>
      </div>

      {sub && (
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${accentColor}22`, color: accentColor }}
          >
            {sub}
          </span>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["admin-overview"],
    queryFn: () => api.get("/api/admin/overview").then((r) => r.data),
  });

  const sortedUsers = data
    ? [...data.users].sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
    : [];

  return (
    <div className="-mx-6 -mt-6 flex" style={{ minHeight: "calc(100vh - 3.5rem)" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className="w-52 shrink-0 border-r border-border/25 flex flex-col sticky top-14 self-start overflow-y-auto"
        style={{ height: "calc(100vh - 3.5rem)", background: "oklch(0.07 0.008 260)" }}
      >
        <div className="flex-1 px-3 pt-7 pb-4 space-y-0.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 px-3 mb-3">Menu</p>
          <NavLink label="Dashboard" icon="⊞" onClick={() => navigate({ to: "/dashboard" })} />
          <NavLink label="History" icon="◷" onClick={() => navigate({ to: "/history" })} />
          <NavLink label="Admin" icon="⚙" active onClick={() => {}} />
        </div>
        <div className="px-3 py-4 border-t border-border/20">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 px-1 mb-3">Access</p>
          <div className="px-3 py-3 rounded-xl bg-white/[0.03] border border-border/20">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Admin</span>
            </div>
            <p className="text-[11px] text-muted-foreground/45">Full access</p>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* Header */}
        <div className="px-8 py-6 border-b border-border/20 cq-enter-1">
          <p className="text-[11px] font-mono text-muted-foreground/40 mb-1">Overview</p>
          <h1 className="text-2xl font-display font-bold text-foreground leading-none">
            Admin <span className="text-primary">Dashboard</span>
          </h1>
        </div>

        <div className="px-8 py-6 space-y-6 pb-12">

          {isLoading && (
            <div className="flex items-center gap-3 py-10">
              <div className="cq-spinner" />
              <p className="text-sm text-muted-foreground">Loading admin data…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4">
              <p className="text-sm text-destructive">Access denied or error loading data.</p>
            </div>
          )}

          {data && (
            <>
              {/* ── Stat cards 2×2 ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4 cq-enter-2">
                <StatCard
                  label="Total Students Enrolled"
                  value={data.stats.totalUsers.toLocaleString()}
                  sub="Registered accounts"
                  accent="blue"
                />
                <StatCard
                  label="Total Quiz Attempts"
                  value={data.stats.totalAttempts.toLocaleString()}
                  sub="All submissions"
                  accent="amber"
                />
                <StatCard
                  label="Course Completion Rate"
                  value={`${data.stats.overallPassRate}%`}
                  sub="≥ 80% threshold"
                  accent="green"
                />
                <StatCard
                  label="Posts Published"
                  value={data.stats.totalPostsPublished.toLocaleString()}
                  sub="Blog & social"
                  accent="green"
                />
              </div>

              {/* ── Users table ──────────────────────────────────── */}
              <div className="cq-enter-3">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-sm font-semibold text-foreground">All Users</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-border/30 text-muted-foreground/60 font-mono">
                      {data.users.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/35">Sorted by last active</p>
                </div>

                <div
                  className="rounded-2xl border border-white/[0.06] overflow-hidden"
                  style={{ background: "linear-gradient(180deg, oklch(0.13 0.014 275), oklch(0.11 0.009 260))" }}
                >
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_90px_80px_60px_90px_110px_50px] gap-0 border-b border-white/[0.06] px-5 py-3">
                    {["User", "Attempts", "Pass Rate", "Posts", "Last Active", "Status", ""].map((h) => (
                      <p key={h} className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/30">{h}</p>
                    ))}
                  </div>

                  {sortedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">No users yet.</p>
                  ) : (
                    sortedUsers.map((u, idx) => {
                      const daysSinceActive = Math.floor(
                        (Date.now() - new Date(u.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24)
                      );
                      const status =
                        u.totalAttempts === 0 ? "inactive"
                        : daysSinceActive <= 2 ? "active"
                        : u.passRate !== null && u.passRate < 50 ? "struggling"
                        : "learning";

                      const statusColor = {
                        active: "oklch(0.70 0.22 145)",
                        learning: "oklch(0.78 0.17 65)",
                        struggling: "oklch(0.65 0.20 25)",
                        inactive: "oklch(0.45 0.01 260)",
                      }[status];

                      const statusLabel = {
                        active: "Active", learning: "Learning",
                        struggling: "Struggling", inactive: "Inactive",
                      }[status];

                      const passRate = u.passRate ?? 0;
                      const passRateColor =
                        u.passRate === null ? "text-muted-foreground/40"
                        : passRate >= 80 ? "text-accent"
                        : passRate >= 50 ? "text-primary"
                        : "text-destructive";

                      return (
                        <div
                          key={u.id}
                          className={`grid grid-cols-[1fr_90px_80px_60px_90px_110px_50px] gap-0 px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors cq-enter-${Math.min(idx + 3, 5)}`}
                        >
                          {/* User */}
                          <div className="min-w-0 pr-4 flex items-center gap-3">
                            <div
                              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                              style={{
                                background: `${statusColor}22`,
                                color: statusColor,
                                border: `1px solid ${statusColor}33`,
                              }}
                            >
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                              <p className="text-[11px] text-muted-foreground/45 truncate">{u.email}</p>
                            </div>
                          </div>
                          {/* Attempts */}
                          <div className="flex items-center">
                            <span className="text-sm text-foreground/70 font-mono">
                              {u.totalAttempts > 0
                                ? `${u.passedAttempts}/${u.totalAttempts}`
                                : <span className="text-muted-foreground/30">—</span>}
                            </span>
                          </div>
                          {/* Pass rate */}
                          <div className="flex items-center">
                            <span className={`text-sm font-semibold font-mono ${passRateColor}`}>
                              {u.passRate !== null ? `${u.passRate}%` : <span className="text-muted-foreground/30">—</span>}
                            </span>
                          </div>
                          {/* Posts */}
                          <div className="flex items-center">
                            <span className="text-sm text-foreground/60 font-mono">
                              {u.postsPublished || <span className="text-muted-foreground/30">—</span>}
                            </span>
                          </div>
                          {/* Last active */}
                          <div className="flex items-center">
                            <span className="text-xs text-muted-foreground/50">{daysSince(u.lastActiveAt)}</span>
                          </div>
                          {/* Status */}
                          <div className="flex items-center">
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: `${statusColor}18`, color: statusColor }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {/* View */}
                          <div className="flex items-center justify-end">
                            <button
                              onClick={() => navigate({ to: "/admin/$userId", params: { userId: u.id } })}
                              className="cq-btn-primary py-1 px-3 text-xs cursor-pointer"
                            >
                              View →
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
