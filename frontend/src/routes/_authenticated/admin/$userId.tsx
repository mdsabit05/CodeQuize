import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/admin/$userId")({
  component: AdminUserPage,
});

type Attempt = {
  attemptId: string;
  score: number | null;
  status: string;
  createdAt: string;
  questionCount: number;
  post: { blogTitle: string | null; blogSlug: string | null; publishedAt: string | null } | null;
};

type TopicGroup = {
  topicJobId: string;
  topics: string[];
  repoFullName: string;
  createdAt: string;
  attempts: Attempt[];
};

type UserDetail = {
  user: { id: string; name: string; email: string; createdAt: string };
  stats: {
    totalAttempts: number;
    passedAttempts: number;
    passRate: number | null;
    repos: string[];
    weakTopics: string[];
  };
  history: TopicGroup[];
};

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

export default function AdminUserPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<UserDetail>({
    queryKey: ["admin-user", userId],
    queryFn: () => api.get(`/api/admin/user/${userId}`).then((r) => r.data),
  });

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
          <NavLink label="Admin" icon="⚙" active onClick={() => navigate({ to: "/admin" })} />
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

        {/* Breadcrumb */}
        <div className="px-8 py-5 border-b border-border/20 flex items-center gap-2 cq-enter-1">
          <button
            onClick={() => navigate({ to: "/admin" })}
            className="text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer"
          >
            ← All Users
          </button>
          {data && (
            <>
              <span className="text-border/25 text-xs">/</span>
              <p className="text-xs text-muted-foreground/35">{data.user.name}</p>
            </>
          )}
        </div>

        <div className="px-8 py-6 space-y-4 pb-12">

          {isLoading && (
            <div className="flex items-center gap-3 py-10">
              <div className="cq-spinner" />
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4">
              <p className="text-sm text-destructive">Access denied or user not found.</p>
            </div>
          )}

          {data && (() => {
            const { user, stats, history } = data;
            const pr = stats.passRate ?? 0;
            const joinDate = new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

            const accentCol =
              stats.passRate === null ? "oklch(0.45 0.01 260)"
              : pr >= 80 ? "oklch(0.70 0.22 145)"
              : pr >= 50 ? "oklch(0.78 0.17 65)"
              : "oklch(0.62 0.19 25)";

            const pct = pr;
            const circumference = 2 * Math.PI * 28;
            const dash = (pct / 100) * circumference;

            return (
              <>
                {/* ── Hero ─────────────────────────────────────────── */}
                <div className="cq-enter-2 grid grid-cols-[1fr_auto] gap-4">

                  {/* Left: identity */}
                  <div
                    className="rounded-2xl border border-white/[0.06] px-6 py-5 flex items-center gap-5"
                    style={{ background: "oklch(0.11 0.012 270)" }}
                  >
                    {/* Avatar ring */}
                    <div className="relative shrink-0 w-16 h-16">
                      <svg className="absolute inset-0 w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="oklch(0.18 0.010 270)" strokeWidth="2.5" />
                        <circle
                          cx="32" cy="32" r="28"
                          fill="none"
                          stroke={accentCol}
                          strokeWidth="2.5"
                          strokeDasharray={`${dash} ${circumference}`}
                          strokeLinecap="round"
                          style={{ transition: "stroke-dasharray 0.6s ease" }}
                        />
                      </svg>
                      <div
                        className="absolute inset-1.5 rounded-full flex items-center justify-center text-xl font-black"
                        style={{ background: `${accentCol}15`, color: accentCol }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Name + meta */}
                    <div className="min-w-0">
                      <h1 className="text-lg font-display font-bold text-foreground leading-tight">{user.name}</h1>
                      <p className="text-sm text-muted-foreground/50 mt-0.5 truncate">{user.email}</p>
                      <p className="text-[11px] text-muted-foreground/30 mt-1 font-mono">Joined {joinDate}</p>
                      {/* Repos inline */}
                      {stats.repos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {stats.repos.map((r) => (
                            <span key={r} className="text-[10px] font-mono px-2 py-0.5 rounded"
                              style={{ background: "oklch(0.16 0.010 270)", border: "1px solid oklch(0.22 0.008 270)", color: "oklch(0.50 0.012 260)" }}>
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: pass rate big */}
                  <div
                    className="rounded-2xl border border-white/[0.06] px-7 py-5 flex flex-col items-center justify-center gap-1 min-w-[130px]"
                    style={{ background: `${accentCol}0C` , borderColor: `${accentCol}25` }}
                  >
                    <p className="text-4xl font-display font-black leading-none" style={{ color: accentCol }}>
                      {stats.passRate !== null ? `${stats.passRate}%` : "—"}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/35 mt-1">Pass Rate</p>
                  </div>
                </div>

                {/* ── Stats row ─────────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-3 cq-enter-2">
                  {[
                    { label: "Total Attempts", value: stats.totalAttempts, color: "oklch(0.78 0.17 65)" },
                    { label: "Passed", value: stats.passedAttempts, color: "oklch(0.70 0.22 145)" },
                    { label: "Repos", value: stats.repos.length, color: "oklch(0.65 0.18 240)" },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/[0.05] px-5 py-4"
                      style={{ background: "oklch(0.11 0.010 270)" }}
                    >
                      <p className="text-2xl font-display font-black text-foreground leading-none">{value}</p>
                      <p className="text-[10px] font-medium mt-2" style={{ color: `${color}80` }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* ── Weak areas ─────────────────────────────────────── */}
                {stats.weakTopics.length > 0 && (
                  <div
                    className="rounded-2xl border border-destructive/15 px-5 py-4 cq-enter-3"
                    style={{ background: "oklch(0.10 0.014 18)" }}
                  >
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-3"
                      style={{ color: "oklch(0.62 0.19 25 / 0.7)" }}>
                      ⚠ Weak Areas — Never Passed
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {stats.weakTopics.map((t) => (
                        <span key={t} className="text-xs px-2.5 py-1 rounded-full"
                          style={{ background: "oklch(0.62 0.19 25 / 0.08)", border: "1px solid oklch(0.62 0.19 25 / 0.18)", color: "oklch(0.62 0.19 25 / 0.70)" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Learning history ─────────────────────────────── */}
                <div className="cq-enter-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <h2 className="text-sm font-semibold text-foreground">Learning History</h2>
                    {history.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                        style={{ background: "oklch(0.16 0.010 270)", color: "oklch(0.50 0.012 260)", border: "1px solid oklch(0.22 0.008 270)" }}>
                        {history.length}
                      </span>
                    )}
                  </div>

                  {history.length === 0 ? (
                    <div className="rounded-2xl border border-white/[0.05] px-5 py-10 text-center"
                      style={{ background: "oklch(0.11 0.010 270)" }}>
                      <p className="text-sm text-muted-foreground/35">No activity yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((group, gIdx) => {
                        const isOpen = expanded === group.topicJobId;
                        const bestScore = group.attempts.length > 0
                          ? Math.max(...group.attempts.map((a) => a.score ?? 0))
                          : null;
                        const everPassed = group.attempts.some((a) => (a.score ?? 0) >= 80);
                        const groupColor = everPassed ? "oklch(0.70 0.22 145)" : "oklch(0.62 0.19 25)";

                        return (
                          <div
                            key={group.topicJobId}
                            className={`rounded-2xl border overflow-hidden transition-all cq-enter-${Math.min(gIdx + 3, 5)}`}
                            style={{
                              background: isOpen ? "oklch(0.12 0.012 272)" : "oklch(0.11 0.010 270)",
                              borderColor: isOpen ? `${groupColor}30` : "oklch(1 0 0 / 0.05)",
                            }}
                          >
                            <button
                              className="w-full text-left px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                              onClick={() => setExpanded(isOpen ? null : group.topicJobId)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  {/* Topic pills */}
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {group.topics.map((t) => (
                                      <span key={t} className="text-[11px] px-2 py-0.5 rounded font-medium"
                                        style={{ background: "oklch(0.17 0.011 270)", color: "oklch(0.55 0.012 260)", border: "1px solid oklch(0.22 0.009 270)" }}>
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground/25 font-mono">{group.repoFullName}</p>
                                </div>

                                <div className="flex items-center gap-4 shrink-0">
                                  {bestScore !== null && (
                                    <div className="text-right">
                                      <p className="text-sm font-bold font-mono" style={{ color: groupColor }}>
                                        {bestScore}%
                                      </p>
                                      <p className="text-[10px] text-muted-foreground/30">best</p>
                                    </div>
                                  )}
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-foreground/60">{group.attempts.length}</p>
                                    <p className="text-[10px] text-muted-foreground/30">attempt{group.attempts.length !== 1 ? "s" : ""}</p>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground/25">{isOpen ? "▲" : "▼"}</span>
                                </div>
                              </div>
                            </button>

                            {isOpen && group.attempts.length > 0 && (
                              <div className="border-t border-white/[0.04] px-5 py-3 space-y-0">
                                {group.attempts.map((a, i) => {
                                  const passed = (a.score ?? 0) >= 80;
                                  const sc = passed ? "oklch(0.70 0.22 145)" : "oklch(0.62 0.19 25)";
                                  const date = new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                                  return (
                                    <div key={a.attemptId}
                                      className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
                                      <div className="flex items-center gap-3">
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                                          style={{ background: `${sc}18`, color: sc, border: `1px solid ${sc}28` }}>
                                          {passed ? "✓" : "✗"}
                                        </div>
                                        <div>
                                          <p className="text-xs font-medium text-foreground/65">Attempt {group.attempts.length - i}</p>
                                          <p className="text-[10px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>{date} · {a.questionCount}q</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {a.post?.publishedAt && (
                                          <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                                            style={{ background: "oklch(0.78 0.17 65 / 0.10)", color: "oklch(0.78 0.17 65 / 0.70)", border: "1px solid oklch(0.78 0.17 65 / 0.18)" }}>
                                            Published
                                          </span>
                                        )}
                                        <span className="text-sm font-bold font-mono" style={{ color: sc }}>
                                          {a.score ?? "—"}%
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
