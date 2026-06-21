import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

type Post = { status: string; blogTitle: string | null; blogSlug: string | null; publishedAt: string | null };

type Attempt = {
  attemptId: string;
  score: number | null;
  status: string;
  createdAt: string;
  questions: { type: string; question: string; options?: string[]; correctAnswer?: string; sampleAnswer?: string }[];
  answers: { questionIndex: number; answer: string }[];
  feedback: { questionIndex: number; correct: boolean; verdict?: string; explanation?: string }[];
  post: Post | null;
};

type TopicHistory = {
  topicJobId: string;
  topics: string[];
  repoFullName: string;
  createdAt: string;
  attempts: Attempt[];
};

function NavLink({ label, icon, active, onClick }: {
  label: string; icon: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
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

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-sm text-muted-foreground/40 font-mono">—</span>;
  const cls =
    score >= 80 ? "cq-badge-green" :
    score >= 60 ? "cq-badge-amber" :
    "cq-badge-red";
  return <span className={`cq-badge ${cls} font-mono`}>{score}%</span>;
}

function AttemptRow({ attempt, index }: { attempt: Attempt; index: number }) {
  const [open, setOpen] = useState(false);
  const passed = (attempt.score ?? 0) >= 80;
  const date = new Date(attempt.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        open ? "border-border/50" : "border-border/20"
      }`}
      style={{ background: open ? "oklch(0.09 0.006 260)" : "oklch(0.095 0.007 260)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.025] transition-colors cursor-pointer"
      >
        <span className="text-xs text-muted-foreground/40 font-mono w-8 shrink-0">#{index + 1}</span>
        <ScoreBadge score={attempt.score} />
        {passed && <span className="cq-badge cq-badge-green">✓ Passed</span>}
        {attempt.post?.publishedAt && <span className="cq-badge cq-badge-amber">● Published</span>}
        <span className="text-xs text-muted-foreground/40 font-mono ml-auto">{date}</span>
        <span className="text-[10px] text-muted-foreground/30 ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border/20 px-4 py-4 space-y-3">
          <div className="space-y-2">
            {attempt.questions.map((q, i) => {
              const ans = attempt.answers.find((a) => a.questionIndex === i);
              const fb = attempt.feedback.find((f) => f.questionIndex === i);
              return (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-3 border-l-2 ${
                    fb?.correct
                      ? "border-l-accent bg-accent/[0.04]"
                      : "border-l-destructive bg-destructive/[0.04]"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground/85 mb-1.5">Q{i + 1}: {q.question}</p>
                  <p className="text-sm text-muted-foreground/60">
                    <span className="font-medium text-foreground/50">Your answer:</span>{" "}
                    {ans?.answer || <em className="text-muted-foreground/35">blank</em>}
                  </p>
                  {fb && !fb.correct && (fb.verdict || fb.explanation) && (
                    <p className="text-sm text-destructive/70 mt-1.5">{fb.verdict ?? fb.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>

          {attempt.post?.status === "done" && (
            <div
              className="rounded-xl border border-border/25 px-4 py-3.5"
              style={{ background: "oklch(0.11 0.008 260)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-1.5">Post written</p>
              <p className="text-sm font-semibold text-foreground">{attempt.post.blogTitle}</p>
              {attempt.post.publishedAt ? (
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-accent">
                    Published {new Date(attempt.post.publishedAt).toLocaleDateString()}
                  </span>
                  {attempt.post.blogSlug && (
                    <a
                      href={`/blog/${attempt.post.blogSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      View →
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/40 mt-1 block">Not yet shared</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.get("/api/history").then((r) => r.data) as Promise<TopicHistory[]>,
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
          <NavLink label="History" icon="◷" active onClick={() => {}} />
          <NavLink label="Admin" icon="⚙" onClick={() => navigate({ to: "/admin" })} />
        </div>

        {/* Stats summary */}
        {data && data.length > 0 && (
          <div className="px-3 py-4 border-t border-border/20">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 px-1 mb-3">Summary</p>
            <div className="px-3 py-3 rounded-xl bg-white/[0.03] border border-border/20 space-y-2.5">
              <div>
                <p className="text-lg font-display font-bold text-foreground">{data.length}</p>
                <p className="text-[11px] text-muted-foreground/45">Topics studied</p>
              </div>
              <div>
                <p className="text-lg font-display font-bold text-foreground">
                  {data.reduce((s, t) => s + t.attempts.length, 0)}
                </p>
                <p className="text-[11px] text-muted-foreground/45">Total attempts</p>
              </div>
              <div>
                <p className="text-lg font-display font-bold text-accent">
                  {data.filter((t) => t.attempts.some((a) => (a.score ?? 0) >= 80)).length}
                </p>
                <p className="text-[11px] text-muted-foreground/45">Topics passed</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Header */}
        <div className="px-8 py-6 border-b border-border/20 cq-enter-1">
          <p className="text-[11px] font-mono text-muted-foreground/40 mb-1">Your progress</p>
          <h1 className="text-2xl font-display font-bold text-foreground leading-none">
            Learning <span className="text-primary">History</span>
          </h1>
        </div>

        <div className="p-8">

          {isLoading && (
            <div className="flex items-center gap-3 py-10">
              <div className="cq-spinner" />
              <p className="text-sm text-muted-foreground">Loading history…</p>
            </div>
          )}

          {!isLoading && !data?.length && (
            <div className="text-center py-20 space-y-4">
              <p className="text-3xl font-display font-bold text-foreground">No history yet</p>
              <p className="text-sm text-muted-foreground/60">Complete a quiz to see your learning history here.</p>
              <button className="cq-btn-primary mt-2" onClick={() => navigate({ to: "/dashboard" })}>
                Go to dashboard →
              </button>
            </div>
          )}

          {data && data.length > 0 && (
            <div className="space-y-4 max-w-3xl">
              {data.map((item, idx) => {
                const passed = item.attempts.some((a) => (a.score ?? 0) >= 80);
                const published = item.attempts.some((a) => a.post?.publishedAt);
                const bestScore = item.attempts.length > 0
                  ? Math.max(...item.attempts.map((a) => a.score ?? 0))
                  : null;

                return (
                  <div
                    key={item.topicJobId}
                    className={`rounded-xl border overflow-hidden cq-enter-${Math.min(idx + 2, 5)} ${
                      passed ? "border-accent/20" : "border-border/25"
                    }`}
                    style={{ background: "oklch(0.11 0.008 260)" }}
                  >
                    {/* Topic header */}
                    <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-border/20">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-muted-foreground/40 font-mono mb-1">{item.repoFullName}</p>
                        <p className="text-sm font-semibold text-foreground leading-snug">{item.topics.join(", ")}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {bestScore !== null && (
                          <span className={`text-sm font-bold font-mono ${
                            bestScore >= 80 ? "text-accent" : bestScore >= 60 ? "text-primary" : "text-destructive"
                          }`}>
                            Best: {bestScore}%
                          </span>
                        )}
                        {passed && <span className="cq-badge cq-badge-green">✓ Passed</span>}
                        {published && <span className="cq-badge cq-badge-amber">● Published</span>}
                        <span className="text-[11px] text-muted-foreground/35 font-mono">
                          {item.attempts.length} attempt{item.attempts.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Attempts */}
                    <div className="p-3 space-y-2">
                      {item.attempts.length === 0 ? (
                        <p className="text-sm text-muted-foreground/40 px-2 py-2">No attempts yet.</p>
                      ) : (
                        item.attempts.map((attempt, i) => (
                          <AttemptRow key={attempt.attemptId} attempt={attempt} index={i} />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
