import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/quiz/$jobId")({
  component: QuizJobPage,
});

type ConceptProgress = {
  title: string;
  description: string;
  index: number;
  attempted: boolean;
  passed: boolean;
};

type Attempt = {
  attemptId: string;
  score: number;
  createdAt: string;
  status: string;
};

type PendingRetry = {
  hasPendingRetry: boolean;
  attemptId?: string;
  score?: number;
  canRetry?: boolean;
  waitSecondsLeft?: number | null;
};


// ── History panel (for passed concepts) ─────────────────────────────────
function AttemptsPanel({ jobId, conceptIndex }: { jobId: string; conceptIndex: number }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<{ attempts: Attempt[] }>({
    queryKey: ["concept-attempts", jobId, conceptIndex],
    queryFn: () => api.get(`/api/quiz/job/${jobId}/concept/${conceptIndex}/attempts`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 pt-4 border-t border-border/40 mt-4">
        <div className="cq-spinner-sm" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const attempts = data?.attempts ?? [];
  if (attempts.length === 0) return <p className="text-sm text-muted-foreground pt-4 border-t border-border/40 mt-4">No attempts yet.</p>;

  return (
    <div className="pt-4 border-t border-border/40 mt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-semibold text-muted-foreground mb-3">Quiz history</p>
      {attempts.map((a, i) => {
        const passed = (a.score ?? 0) >= 80;
        const date = new Date(a.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
        return (
          <button
            key={a.attemptId}
            onClick={() => navigate({ to: "/quiz-gen/attempt/$attemptId", params: { attemptId: a.attemptId } })}
            className="cq-row w-full justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${passed ? "bg-accent" : "bg-destructive/60"}`} />
              <div>
                <p className="text-sm font-medium text-foreground/85">Attempt {attempts.length - i}</p>
                <p className="text-xs text-muted-foreground font-mono">{date}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold font-mono ${passed ? "text-accent" : "text-destructive"}`}>{a.score}%</span>
              <span className="text-xs text-muted-foreground">View →</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Inline section for attempted-but-not-passed concepts ─────────────────
function ConceptAttemptSection({
  jobId, conceptIndex, pendingRetry, onPendingChange,
}: {
  jobId: string;
  conceptIndex: number;
  pendingRetry: PendingRetry | undefined;
  onPendingChange: (index: number, is: boolean) => void;
}) {
  const navigate = useNavigate();
  const [secsLeft, setSecsLeft] = useState<number | null>(null);

  const { data } = useQuery<{ attempts: Attempt[] }>({
    queryKey: ["concept-attempts", jobId, conceptIndex],
    queryFn: () => api.get(`/api/quiz/job/${jobId}/concept/${conceptIndex}/attempts`).then((r) => r.data),
  });

  const lastAttempt = data?.attempts?.[0];
  const isPending = !!(
    pendingRetry?.hasPendingRetry &&
    lastAttempt?.attemptId === pendingRetry.attemptId
  );

  useEffect(() => {
    if (lastAttempt !== undefined) onPendingChange(conceptIndex, isPending);
  }, [isPending, lastAttempt]);

  useEffect(() => {
    if (isPending && pendingRetry?.waitSecondsLeft != null) {
      setSecsLeft(pendingRetry.waitSecondsLeft);
    }
  }, [isPending, pendingRetry?.waitSecondsLeft]);

  useEffect(() => {
    if (!secsLeft) return;
    const t = setTimeout(() => setSecsLeft((s) => (s ? s - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [secsLeft]);

  const scoreColor = lastAttempt
    ? (lastAttempt.score >= 80 ? "text-accent" : lastAttempt.score >= 60 ? "text-primary" : "text-destructive")
    : "";

  if (isPending && lastAttempt) {
    const canRetry = pendingRetry?.canRetry || !secsLeft;
    const m = Math.floor((secsLeft ?? 0) / 60);
    const sv = (secsLeft ?? 0) % 60;
    const timeStr = `${String(m).padStart(2, "0")}:${String(sv).padStart(2, "0")}`;

    return (
      <div
        className="mt-3 rounded-lg border border-primary/20 px-4 py-3 flex items-center justify-between gap-4"
        style={{ background: "linear-gradient(135deg, oklch(0.13 0.013 65 / 40%), oklch(0.10 0.006 260))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs font-semibold text-foreground/80 mb-0.5">Pending quiz</p>
          <p className="text-xs text-muted-foreground/60">
            Last score:{" "}
            <span className={`font-mono font-semibold ${scoreColor}`}>{lastAttempt.score}%</span>
            {" · "}
            {canRetry
              ? <span className="text-accent">Ready to retry</span>
              : <>Retry in <span className="font-mono text-primary/70">{timeStr}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canRetry && (
            <button
              className="cq-btn-primary py-1 px-3 text-xs"
              onClick={() => navigate({ to: "/quiz-gen/attempt/$attemptId", params: { attemptId: lastAttempt.attemptId } })}
            >
              Retry →
            </button>
          )}
          <button
            className="cq-btn-secondary py-1 px-3 text-xs"
            onClick={() => navigate({ to: "/quiz-gen/attempt/$attemptId", params: { attemptId: lastAttempt.attemptId } })}
          >
            View →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      {lastAttempt && (
        <>
          <span className={`text-xs font-mono font-semibold ${scoreColor}`}>{lastAttempt.score}%</span>
          <span className="text-xs text-muted-foreground/30">·</span>
        </>
      )}
      <span className="text-xs text-primary/70 font-medium">Find topic →</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────
function QuizJobPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [pendingIndices, setPendingIndices] = useState<Set<number>>(new Set());
  const [confirmReset, setConfirmReset] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/api/quiz/job/${jobId}`),
    onSuccess: () => navigate({ to: "/dashboard" }),
  });

  function handlePendingChange(index: number, is: boolean) {
    setPendingIndices((prev) => {
      const next = new Set(prev);
      if (is) next.add(index); else next.delete(index);
      return next;
    });
  }

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-job", jobId],
    queryFn: () =>
      api.get(`/api/quiz/job/${jobId}`).then((r) => r.data) as Promise<{
        status: string;
        concepts: { title: string; description: string }[] | null;
        error: string | null;
      }>,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });

  const { data: progress } = useQuery({
    queryKey: ["quiz-progress", jobId],
    queryFn: () =>
      api.get(`/api/quiz/job/${jobId}/progress`).then((r) => r.data) as Promise<{ concepts: ConceptProgress[] }>,
    enabled: data?.status === "done",
    refetchInterval: 10_000,
  });

  const { data: pendingRetry } = useQuery<PendingRetry>({
    queryKey: ["pending-retry"],
    queryFn: () => api.get("/api/quiz-gen/pending-retry").then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const concepts =
    progress?.concepts ??
    data?.concepts?.map((c, i) => ({ ...c, index: i, attempted: false, passed: false })) ??
    [];

  const allPassed = concepts.length > 0 && concepts.every((c) => c.passed);
  const passedCount = concepts.filter((c) => c.passed).length;
  const pct = concepts.length > 0 ? Math.round((passedCount / concepts.length) * 100) : 0;

  function handleCardClick(concept: ConceptProgress) {
    if (concept.passed) {
      setExpandedConcept((prev) => (prev === concept.index ? null : concept.index));
      return;
    }
    if (pendingIndices.has(concept.index)) return;
    navigate({ to: "/topic/start/$quizJobId/$conceptIndex", params: { quizJobId: jobId, conceptIndex: String(concept.index) } });
  }

  if (isLoading || data?.status === "pending") {
    return (
      <div className="flex items-center gap-3 py-10">
        <div className="cq-spinner" />
        <p className="text-sm text-muted-foreground">Reading your code and finding concepts…</p>
      </div>
    );
  }

  if (data?.status === "error") {
    return (
      <div className="space-y-3 py-10">
        <p className="text-sm text-destructive">Something went wrong: {data.error}</p>
        <button className="cq-btn-secondary text-sm" onClick={() => navigate({ to: "/dashboard" })}>← Dashboard</button>
      </div>
    );
  }

  return (
    <div className="pb-12 max-w-5xl mx-auto">

      {/* ── Back button ─────────────────────────────────────────── */}
      <div className="mb-5 cq-enter-1">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer flex items-center gap-1.5 font-medium"
          >
            ← Dashboard
          </button>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="text-sm text-destructive/50 hover:text-destructive transition-colors cursor-pointer font-medium"
            >
              Reset repo
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground/60">Delete all quiz data?</span>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="text-sm font-semibold text-destructive hover:text-destructive/80 transition-colors cursor-pointer"
              >
                {resetMutation.isPending ? "Resetting…" : "Yes, reset"}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="text-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-muted-foreground/30 mb-1">
          {concepts.length} concepts found
        </p>
        <h1 className="text-4xl font-display font-black text-foreground leading-none tracking-tight">
          Your <span className="text-primary">Concepts</span>
        </h1>
      </div>

      <div>

          {/* ── Top widgets row ─────────────────────────────────── */}
          {concepts.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mb-6">

              {/* LEFT: Donut progress ring */}
              <div
                className="rounded-2xl border border-white/[0.06] p-5 flex items-center gap-6"
                style={{ background: "oklch(0.12 0.012 272)" }}
              >
                {/* Donut SVG */}
                <div className="relative shrink-0 w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                    {/* Track */}
                    <circle cx="40" cy="40" r="32" fill="none" stroke="oklch(0.20 0.010 260)" strokeWidth="6" />
                    {/* In-progress arc (amber) — shown before passed */}
                    {pendingIndices.size > 0 && (
                      <circle cx="40" cy="40" r="32" fill="none"
                        stroke="oklch(0.78 0.17 65)"
                        strokeWidth="6"
                        strokeDasharray={`${((passedCount + pendingIndices.size) / concepts.length) * 201} 201`}
                        strokeLinecap="butt"
                        style={{ opacity: 0.5 }}
                      />
                    )}
                    {/* Passed arc (green) */}
                    <circle cx="40" cy="40" r="32" fill="none"
                      stroke="oklch(0.70 0.22 145)"
                      strokeWidth="6"
                      strokeDasharray={`${(passedCount / concepts.length) * 201} 201`}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-foreground leading-none">{passedCount}</span>
                    <span className="text-[9px] text-muted-foreground/40 font-mono mt-0.5">/{concepts.length}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/30 mb-2.5">Progress</p>
                    <div className="space-y-2">
                      {[
                        { label: "Passed", value: passedCount, col: "oklch(0.70 0.22 145)" },
                        { label: "In progress", value: pendingIndices.size, col: "oklch(0.78 0.17 65)" },
                        { label: "Remaining", value: concepts.length - passedCount - pendingIndices.size, col: "oklch(0.35 0.010 260)" },
                      ].map(({ label, value, col }) => (
                        <div key={label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col }} />
                            <span className="text-xs text-muted-foreground/50">{label}</span>
                          </div>
                          <span className="text-xs font-bold font-mono" style={{ color: col }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Mini bar */}
                  <div className="h-1.5 rounded-full overflow-hidden flex gap-0.5" style={{ background: "oklch(0.18 0.008 260)" }}>
                    {passedCount > 0 && (
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${(passedCount / concepts.length) * 100}%`, background: "oklch(0.70 0.22 145)" }} />
                    )}
                    {pendingIndices.size > 0 && (
                      <div className="h-full transition-all duration-700"
                        style={{ width: `${(pendingIndices.size / concepts.length) * 100}%`, background: "oklch(0.78 0.17 65 / 0.60)" }} />
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT: Quick info */}
              <div
                className="rounded-2xl border border-white/[0.06] p-5 flex flex-col justify-between"
                style={{ background: "oklch(0.12 0.012 272)" }}
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/30 mb-3">At a Glance</p>
                <div className="grid grid-cols-2 gap-3 flex-1">
                  {[
                    {
                      label: "Total",
                      value: concepts.length,
                      sub: "concepts",
                      col: "oklch(0.65 0.18 240)",
                    },
                    {
                      label: "Completion",
                      value: `${pct}%`,
                      sub: "done",
                      col: pct >= 80 ? "oklch(0.70 0.22 145)" : pct >= 40 ? "oklch(0.78 0.17 65)" : "oklch(0.62 0.19 25)",
                    },
                    {
                      label: "Passed",
                      value: passedCount,
                      sub: "≥ 80%",
                      col: "oklch(0.70 0.22 145)",
                    },
                    {
                      label: "Todo",
                      value: concepts.length - passedCount,
                      sub: "remaining",
                      col: "oklch(0.45 0.010 260)",
                    },
                  ].map(({ label, value, sub, col }) => (
                    <div key={label}
                      className="rounded-xl px-3 py-2.5"
                      style={{ background: `${col}0C`, border: `1px solid ${col}18` }}>
                      <p className="text-lg font-black leading-none" style={{ color: col }}>{value}</p>
                      <p className="text-[10px] text-muted-foreground/40 mt-1">{label}</p>
                      <p className="text-[9px] font-mono" style={{ color: `${col}60` }}>{sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {allPassed && (
            <div className="rounded-2xl border border-accent/20 px-5 py-3 flex items-center gap-3 mb-4"
              style={{ background: "linear-gradient(90deg, oklch(0.70 0.22 145 / 8%), oklch(0.11 0.010 270))" }}>
              <span className="text-base">🎉</span>
              <p className="text-sm font-bold text-accent">All concepts complete — outstanding work.</p>
            </div>
          )}

          {/* ── Concepts 2-col grid ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2.5">
            {concepts.map((concept, idx) => {
              const isExpanded = expandedConcept === concept.index;
              const isAttempted = concept.attempted && !concept.passed;
              const isBlocked = pendingIndices.has(concept.index);

              const accentCol = concept.passed
                ? "oklch(0.70 0.22 145)"
                : isBlocked ? "oklch(0.78 0.17 65)"
                : null;

              return (
                <div
                  key={concept.index}
                  className={`group relative rounded-xl overflow-hidden transition-all duration-150 cq-enter-${Math.min(idx + 2, 5)} ${
                    isExpanded ? "col-span-2" : ""
                  } ${!isBlocked ? "cursor-pointer" : ""}`}
                  style={{
                    background: "oklch(0.115 0.011 272)",
                    border: `1px solid ${accentCol ? `${accentCol}1A` : "oklch(1 0 0 / 0.055)"}`,
                  }}
                  onClick={() => handleCardClick(concept)}
                >
                  {/* Top accent strip */}
                  {accentCol && (
                    <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${accentCol}BB, transparent)` }} />
                  )}
                  {!isBlocked && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ background: "oklch(1 0 0 / 0.015)" }} />
                  )}

                  <div className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      {/* Status dot */}
                      <div className="flex items-center gap-2.5 mt-0.5">
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: accentCol ?? "oklch(0.25 0.008 260)" }} />
                        <p className={`text-lg font-bold leading-snug ${
                          concept.passed ? "text-foreground/60" : "text-foreground/90 group-hover:text-foreground"
                        } transition-colors`}>
                          {concept.title}
                        </p>
                      </div>
                      {concept.passed ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "oklch(0.70 0.22 145 / 0.10)", color: "oklch(0.70 0.22 145)", border: "1px solid oklch(0.70 0.22 145 / 0.18)" }}>
                          ✓
                        </span>
                      ) : isBlocked ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "oklch(0.78 0.17 65 / 0.10)", color: "oklch(0.78 0.17 65)", border: "1px solid oklch(0.78 0.17 65 / 0.18)" }}>
                          ●
                        </span>
                      ) : null}
                    </div>

                    <p className="text-sm text-muted-foreground/45 leading-relaxed line-clamp-2 pl-[18px]">
                      {concept.description}
                    </p>

                    {isAttempted && (
                      <div className="mt-2.5 pl-[18px]" onClick={(e) => e.stopPropagation()}>
                        <ConceptAttemptSection
                          jobId={jobId}
                          conceptIndex={concept.index}
                          pendingRetry={pendingRetry}
                          onPendingChange={handlePendingChange}
                        />
                      </div>
                    )}

                    {!concept.passed && !concept.attempted && (
                      <p className="text-xs font-semibold mt-2.5 pl-[18px]" style={{ color: "oklch(0.78 0.17 65 / 0.55)" }}>
                        Find topic →
                      </p>
                    )}
                    {concept.passed && (
                      <p className="text-xs mt-2 pl-[18px]" style={{ color: "oklch(0.70 0.22 145 / 0.45)" }}>
                        {isExpanded ? "Hide history ▲" : "View history ▼"}
                      </p>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-2"
                      style={{ borderColor: "oklch(1 0 0 / 0.06)" }}
                      onClick={(e) => e.stopPropagation()}>
                      <AttemptsPanel jobId={jobId} conceptIndex={concept.index} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

      </div>
    </div>
  );
}
