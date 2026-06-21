import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// ── Decorative sparkline (deterministic per repo name) ──────────────────
function RepoSparkline({ name }: { name: string }) {
  const hash = Math.abs(name.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0));
  const W = 96, H = 30;
  const pts = Array.from({ length: 9 }, (_, i) => {
    const x = (i / 8) * W;
    const y = H / 2
      + Math.sin(i * 1.3 + (hash % 60) * 0.1) * 9
      + Math.sin(i * 2.7 + (hash % 40) * 0.16) * 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="opacity-35 shrink-0">
      <polyline points={pts} stroke="oklch(0.78 0.17 65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Sidebar nav link ────────────────────────────────────────────────────
function NavLink({
  label, icon, active, onClick,
}: { label: string; icon: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.04] font-medium"
      }`}
      style={{ fontSize: "13px" }}
    >
      <span className="text-base leading-none opacity-60">{icon}</span>
      {label}
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </button>
  );
}

// ── Repo card ────────────────────────────────────────────────────────────
function RepoCard({
  repo, index,
}: { repo: { repoId: string; repoFullName: string }; index: number }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const slash = repo.repoFullName.indexOf("/");
  const owner = repo.repoFullName.slice(0, slash);
  const name = repo.repoFullName.slice(slash + 1);

  async function handleStart(refresh = false) {
    if (refresh) setRefreshLoading(true);
    else setLoading(true);
    setShowConfirm(false);
    try {
      const { data } = await api.post("/api/quiz/start", { repoFullName: repo.repoFullName, refresh });
      navigate({ to: "/quiz/$jobId", params: { jobId: data.jobId } });
    } catch {
      setLoading(false);
      setRefreshLoading(false);
    }
  }

  return (
    <div
      className={`rounded-xl border border-border/30 hover:border-border/50 transition-all duration-200 cq-enter-${Math.min(index + 2, 5)}`}
      style={{ background: "oklch(0.11 0.008 260)" }}
    >
      <div className="px-5 pt-4 pb-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground/40 font-mono uppercase tracking-wide mb-1">GitHub Repository</p>
            <p className="text-sm font-semibold text-foreground truncate">
              <span className="text-muted-foreground/50 font-normal">{owner}/</span>{name}
            </p>
          </div>
          <button
            className="w-7 h-7 rounded-lg border border-border/35 hover:border-primary/30 hover:bg-primary/5 flex items-center justify-center text-muted-foreground/35 hover:text-primary transition-all text-sm shrink-0 mt-0.5"
            onClick={() => window.open(`https://github.com/${repo.repoFullName}`, "_blank")}
            title="Open on GitHub"
          >
            ↗
          </button>
        </div>
      </div>

      {/* Bottom row: sparkline + actions */}
      <div className="px-5 pb-4 flex items-end justify-between gap-3">
        <RepoSparkline name={repo.repoFullName} />

        <div className="flex items-center gap-1.5">
          {showConfirm ? (
            <>
              <button
                className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                onClick={() => handleStart(true)}
                disabled={refreshLoading}
              >
                {refreshLoading ? "…" : "Refresh topics?"}
              </button>
              <button
                className="text-xs px-2 py-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground transition-colors"
                onClick={() => setShowConfirm(false)}
              >
                ×
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleStart(false)}
                disabled={loading || refreshLoading}
                className="cq-btn-primary py-1.5 px-4 text-xs"
              >
                {loading ? "Starting…" : "Start quiz"}
              </button>
              <button
                className="w-7 h-7 rounded-lg border border-border/35 hover:border-border/60 hover:bg-white/[0.04] flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-all text-sm"
                title="Refresh topics from latest commits"
                onClick={() => setShowConfirm(true)}
              >
                ↻
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────
function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  const { data: ghStatus, isLoading: ghLoading } = useQuery({
    queryKey: ["github-status"],
    queryFn: () => api.get("/api/github/status").then((r) => r.data),
  });

  const { data: selectedRepos } = useQuery({
    queryKey: ["github-selected"],
    queryFn: () => api.get("/api/github/repos/selected").then((r) => r.data),
    enabled: ghStatus?.connected === true,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete("/api/github/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-selected"] });
    },
  });

  async function handleConnect() {
    const { data } = await api.get("/api/github/connect");
    window.location.replace(data.url);
  }

  const repos: { repoId: string; repoFullName: string }[] = selectedRepos?.repos ?? [];

  return (
    <div className="-mx-6 -mt-6 flex" style={{ minHeight: "calc(100vh - 4rem)" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className="w-64 shrink-0 border-r border-border/25 flex flex-col sticky top-16 self-start overflow-y-auto"
        style={{ height: "calc(100vh - 4rem)", background: "oklch(0.07 0.008 260)" }}
      >
        {/* Nav links */}
        <div className="flex-1 px-4 pt-8 pb-4 space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/40 px-3 mb-4">
            Menu
          </p>
          <NavLink label="Dashboard" icon="⊞" active onClick={() => {}} />
          <NavLink label="History" icon="◷" onClick={() => navigate({ to: "/history" })} />
          <NavLink label="Admin" icon="⚙" onClick={() => navigate({ to: "/admin" })} />
        </div>

        {/* GitHub status */}
        <div className="px-4 py-5 border-t border-border/20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/40 px-1 mb-4">
            GitHub
          </p>
          {ghStatus?.connected ? (
            <div className="px-3 py-3 rounded-xl bg-white/[0.03] border border-border/20 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-semibold text-accent uppercase tracking-wide">Connected</span>
              </div>
              <p className="text-xs font-mono text-foreground/65">@{ghStatus.username}</p>
              <p className="text-[11px] text-muted-foreground/45">
                {repos.length} repo{repos.length !== 1 ? "s" : ""} added
              </p>
            </div>
          ) : (
            <button
              className="w-full px-3 py-2.5 rounded-xl border border-primary/20 text-xs text-primary font-medium hover:bg-primary/8 transition-colors text-left"
              onClick={handleConnect}
            >
              Connect GitHub →
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Top header */}
        <div className="px-8 py-10 border-b border-border/20 flex items-center justify-between gap-6 max-w-3xl">
          <div className="cq-enter-1">
            {!meLoading && (
              <>
                <p className="text-[11px] font-mono text-muted-foreground/45 mb-1">{me?.user?.email}</p>
                <h1 className="text-4xl font-display font-black text-foreground leading-none tracking-tight">
                  Welcome,{" "}
                  <span className="text-primary">{me?.user?.name?.split(" ")[0] ?? me?.user?.name}</span>
                </h1>
              </>
            )}
          </div>

          {ghStatus?.connected && (
            <div className="flex items-center gap-2 shrink-0 cq-enter-1">
              <button
                className="cq-btn-secondary text-xs py-1.5 px-3"
                onClick={() => navigate({ to: "/github/repos" })}
              >
                Manage repos
              </button>
              <button
                className="cq-btn-ghost text-xs py-1.5 px-3 text-muted-foreground/55 hover:text-muted-foreground"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-8 grid grid-cols-3 gap-6 items-start">

          {/* Left: repos (2/3) */}
          <div className="col-span-2 space-y-4">

            {/* Section label */}
            <div className="flex items-center justify-between cq-enter-2">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-foreground">Your Repositories</h2>
                {repos.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-border/30 text-muted-foreground/60 font-mono">
                    {repos.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/35">Recommended for 24 hrs</p>
            </div>

            {/* Repo list */}
            {ghLoading ? (
              <div className="flex items-center gap-3 py-10">
                <div className="cq-spinner" />
                <span className="text-sm text-muted-foreground">Loading…</span>
              </div>
            ) : !ghStatus?.connected ? (
              <div
                className="rounded-xl border border-border/25 p-10 text-center space-y-4 cq-enter-3"
                style={{ background: "oklch(0.11 0.008 260)" }}
              >
                <p className="text-4xl">⚡</p>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">Connect your GitHub</p>
                  <p className="text-xs text-muted-foreground">Start learning from code you actually write</p>
                </div>
                <button className="cq-btn-primary" onClick={handleConnect}>Connect GitHub →</button>
              </div>
            ) : repos.length === 0 ? (
              <div
                className="rounded-xl border border-border/25 p-8 text-center space-y-3 cq-enter-3"
                style={{ background: "oklch(0.11 0.008 260)" }}
              >
                <p className="text-sm text-muted-foreground">No repos selected yet.</p>
                <button className="cq-btn-secondary text-sm" onClick={() => navigate({ to: "/github/repos" })}>
                  Select repos →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {repos.map((r, idx) => (
                  <RepoCard key={r.repoId} repo={r} index={idx} />
                ))}
              </div>
            )}

          </div>

          {/* Right: feature panel (1/3) */}
          <div className="space-y-3 cq-enter-3">

            {/* How it works card */}
            <div
              className="rounded-xl border border-border/30 overflow-hidden relative"
              style={{ background: "linear-gradient(145deg, oklch(0.13 0.016 265), oklch(0.10 0.010 255))" }}
            >
              {/* Decorative diagonal lines */}
              <svg
                className="absolute bottom-0 right-0 opacity-[0.06] pointer-events-none"
                width="110" height="110" viewBox="0 0 110 110" fill="none"
              >
                <line x1="110" y1="0" x2="0" y2="110" stroke="white" strokeWidth="1" />
                <line x1="110" y1="28" x2="28" y2="110" stroke="white" strokeWidth="1" />
                <line x1="110" y1="56" x2="56" y2="110" stroke="white" strokeWidth="1" />
                <line x1="110" y1="84" x2="84" y2="110" stroke="white" strokeWidth="1" />
              </svg>

              <div className="relative p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/20 border border-primary/25 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-primary" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        &lt;/&gt;
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground/65 tracking-wide">CodeQuize</span>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-bold uppercase tracking-wider">
                    Beta
                  </span>
                </div>

                <h3 className="text-lg font-display font-bold text-foreground leading-snug mb-2">
                  Learn from<br />your own code
                </h3>
                <p className="text-xs text-muted-foreground/65 leading-relaxed mb-5">
                  AI analyzes your GitHub repos and generates personalized quizzes on concepts you actually use.
                </p>

                <div className="space-y-1.5">
                  {[
                    { n: "01", label: "Find topics in your repo", accent: "text-primary" },
                    { n: "02", label: "Take an AI-generated quiz", accent: "text-primary" },
                    { n: "03", label: "Get scored & improve", accent: "text-accent" },
                  ].map(({ n, label, accent }) => (
                    <div
                      key={n}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"
                    >
                      <span className={`text-[11px] font-bold font-mono shrink-0 ${accent}`}>{n}</span>
                      <span className="text-xs text-foreground/55">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div
              className="rounded-xl border border-border/25 p-4"
              style={{ background: "oklch(0.11 0.008 260)" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/35 mb-3 px-1">
                Quick links
              </p>
              <div className="space-y-0.5">
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
                  onClick={() => navigate({ to: "/history" })}
                >
                  <span className="text-sm text-foreground/60 group-hover:text-foreground/85 transition-colors">Quiz History</span>
                  <span className="text-muted-foreground/25 group-hover:text-muted-foreground/50 transition-colors text-sm">→</span>
                </button>
                {ghStatus?.connected && (
                  <button
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
                    onClick={() => navigate({ to: "/github/repos" })}
                  >
                    <span className="text-sm text-foreground/60 group-hover:text-foreground/85 transition-colors">Manage Repos</span>
                    <span className="text-muted-foreground/25 group-hover:text-muted-foreground/50 transition-colors text-sm">→</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
