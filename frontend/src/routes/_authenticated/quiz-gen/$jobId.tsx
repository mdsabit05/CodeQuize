import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/quiz-gen/$jobId")({
  component: QuizPage,
});

type MCQ   = { type: "mcq";   question: string; options: string[]; correctAnswer: string };
type Short = { type: "short"; question: string; sampleAnswer: string };
type Code  = { type: "code";  question: string; language: string; sampleAnswer: string };
type Question = MCQ | Short | Code;

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

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

function QuizPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-gen-job", jobId],
    queryFn: () =>
      api.get(`/api/quiz-gen/job/${jobId}`).then((r) => r.data) as Promise<{
        status: string;
        questions: Question[] | null;
        error: string | null;
      }>,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/quiz-gen/${jobId}/submit`, {
        answers: Object.entries(answers).map(([idx, answer]) => ({ questionIndex: Number(idx), answer })),
      }).then((r) => r.data),
    onSuccess: (data) => navigate({ to: "/quiz-gen/attempt/$attemptId", params: { attemptId: data.attemptId } }),
  });

  if (isLoading || data?.status === "pending") {
    return (
      <div className="-mx-6 -mt-6 flex" style={{ minHeight: "calc(100vh - 3.5rem)" }}>
        <aside
          className="w-52 shrink-0 border-r border-border/25 flex flex-col sticky top-14 self-start"
          style={{ height: "calc(100vh - 3.5rem)", background: "oklch(0.07 0.008 260)" }}
        >
          <div className="flex-1 px-3 pt-7 pb-4 space-y-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 px-3 mb-3">Menu</p>
            <NavLink label="Dashboard" icon="⊞" onClick={() => navigate({ to: "/dashboard" })} />
            <NavLink label="History" icon="◷" onClick={() => navigate({ to: "/history" })} />
          </div>
        </aside>
        <div className="flex-1 flex items-center gap-3 px-10 py-10">
          <div className="cq-spinner" />
          <p className="text-sm text-muted-foreground">Generating quiz questions…</p>
        </div>
      </div>
    );
  }

  if (data?.status === "error") {
    return (
      <div className="-mx-6 -mt-6 flex" style={{ minHeight: "calc(100vh - 3.5rem)" }}>
        <aside
          className="w-52 shrink-0 border-r border-border/25 flex flex-col sticky top-14 self-start"
          style={{ height: "calc(100vh - 3.5rem)", background: "oklch(0.07 0.008 260)" }}
        >
          <div className="flex-1 px-3 pt-7 pb-4 space-y-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 px-3 mb-3">Menu</p>
            <NavLink label="Dashboard" icon="⊞" onClick={() => navigate({ to: "/dashboard" })} />
            <NavLink label="History" icon="◷" onClick={() => navigate({ to: "/history" })} />
          </div>
        </aside>
        <div className="flex-1 px-10 py-10 space-y-3">
          <p className="text-sm text-destructive">Something went wrong: {data.error}</p>
          <button className="cq-btn-secondary text-sm" onClick={() => navigate({ to: "/dashboard" })}>← Dashboard</button>
        </div>
      </div>
    );
  }

  const questions = data?.questions ?? [];
  const answeredCount = questions.filter((_, i) => answers[i]?.trim()).length;
  const unansweredCount = questions.length - answeredCount;
  const mcqCount = questions.filter(q => q.type === "mcq").length;
  const shortCount = questions.filter(q => q.type === "short").length;
  const codeCount = questions.filter(q => q.type === "code").length;
  const pct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

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
        </div>

        {/* Progress panel */}
        {questions.length > 0 && (
          <div className="px-3 py-4 border-t border-border/20">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 px-1 mb-3">Progress</p>
            <div className="px-3 py-3 rounded-xl bg-white/[0.03] border border-border/20 space-y-3">

              {/* Circular-ish progress */}
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 shrink-0">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="oklch(0.18 0.01 260)" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="14"
                      fill="none"
                      stroke="oklch(0.78 0.17 65)"
                      strokeWidth="3"
                      strokeDasharray={`${pct * 0.88} 88`}
                      strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono text-primary">
                    {pct}%
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground font-mono">{answeredCount}/{questions.length}</p>
                  <p className="text-[11px] text-muted-foreground/50">answered</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Type breakdown */}
              <div className="space-y-1.5 pt-0.5">
                {mcqCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/50">Multiple choice</span>
                    <span className="text-[11px] font-mono text-primary/70">{mcqCount}</span>
                  </div>
                )}
                {shortCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/50">Short answer</span>
                    <span className="text-[11px] font-mono text-primary/70">{shortCount}</span>
                  </div>
                )}
                {codeCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/50">Code</span>
                    <span className="text-[11px] font-mono text-accent/70">{codeCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* Header */}
        <div className="px-8 py-6 border-b border-border/20 cq-enter-1">
          <p className="text-[11px] font-mono text-muted-foreground/40 mb-1">Quiz in progress</p>
          <h1 className="text-2xl font-display font-bold text-foreground leading-none">
            Answer <span className="text-primary">Questions</span>
          </h1>
        </div>

        <div className="px-8 py-6 space-y-4 pb-12">

          {/* Questions */}
          {questions.map((q, i) => (
            <div
              key={i}
              className={`cq-card overflow-hidden cq-enter-${Math.min(i + 2, 5)} ${answers[i]?.trim() ? "border-primary/25" : ""}`}
            >
              {/* Question header */}
              <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-border/30">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-xs font-mono font-bold text-primary shrink-0 mt-0.5 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm font-medium text-foreground leading-relaxed">{q.question}</p>
                </div>
                <span className={`shrink-0 cq-badge ml-1 ${
                  q.type === "mcq" ? "cq-badge-amber" :
                  q.type === "code" ? "cq-badge-green" :
                  "cq-badge-neutral"
                }`}>
                  {q.type === "mcq" ? "MCQ" : q.type === "code" ? "Code" : "Short"}
                </span>
              </div>

              {/* Answer area */}
              <div className="px-5 py-4">
                {q.type === "mcq" ? (
                  <div className="space-y-2">
                    {q.options.map((opt, j) => (
                      <label
                        key={j}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                          answers[i] === opt
                            ? "border-primary/50 bg-primary/8"
                            : "border-border/40 hover:border-border/70 hover:bg-white/[0.03]"
                        }`}
                      >
                        <span className={`w-6 h-6 rounded border flex items-center justify-center text-[11px] font-bold shrink-0 font-mono transition-all ${
                          answers[i] === opt
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border/60 text-muted-foreground"
                        }`}>
                          {OPTION_LABELS[j]}
                        </span>
                        <input
                          type="radio"
                          name={`q-${i}`}
                          value={opt}
                          checked={answers[i] === opt}
                          onChange={() => setAnswers((prev) => ({ ...prev, [i]: opt }))}
                          className="sr-only"
                        />
                        <span className={`text-sm ${answers[i] === opt ? "text-foreground" : "text-foreground/75"}`}>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : q.type === "code" ? (
                  <div className="rounded-lg overflow-hidden border border-border/40">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[oklch(0.07_0.008_260)] border-b border-border/40">
                      <span className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                      <span className="w-2.5 h-2.5 rounded-full bg-primary/50" />
                      <span className="w-2.5 h-2.5 rounded-full bg-accent/50" />
                      <span className="ml-2 text-xs text-muted-foreground/60 font-mono">{q.language}</span>
                    </div>
                    <textarea
                      className="w-full bg-[oklch(0.07_0.008_260)] text-foreground/85 p-4 text-[13px] resize-y focus:outline-none min-h-[180px] leading-relaxed font-mono"
                      placeholder={`// Write your ${q.language} code here…`}
                      value={answers[i] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  </div>
                ) : (
                  <textarea
                    className="cq-input resize-none leading-relaxed"
                    style={{ minHeight: '100px' }}
                    placeholder="Write your answer here…"
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                  />
                )}
              </div>
            </div>
          ))}

          {/* Submit */}
          {questions.length > 0 && (
            <div className="pt-2 space-y-2">
              {showConfirm ? (
                <div
                  className="rounded-xl border border-primary/25 px-5 py-4 space-y-3"
                  style={{ background: "oklch(0.11 0.008 260)" }}
                >
                  <p className="text-sm font-semibold text-foreground">Ready to submit?</p>
                  <p className="text-sm text-muted-foreground">
                    {unansweredCount > 0
                      ? `You have ${unansweredCount} unanswered question${unansweredCount !== 1 ? "s" : ""}. Unanswered questions will be marked as incorrect.`
                      : "All questions answered. Good luck!"}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="cq-btn-primary flex-1 py-2 text-sm cursor-pointer"
                      onClick={() => submitMutation.mutate()}
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending ? "Submitting…" : "Yes, submit"}
                    </button>
                    <button
                      className="cq-btn-secondary flex-1 py-2 text-sm cursor-pointer"
                      onClick={() => setShowConfirm(false)}
                      disabled={submitMutation.isPending}
                    >
                      Go back
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="cq-btn-primary w-full py-3 text-base cursor-pointer"
                  onClick={() => setShowConfirm(true)}
                  disabled={submitMutation.isPending}
                >
                  Submit quiz →
                </button>
              )}
              {!showConfirm && unansweredCount > 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  {unansweredCount} question{unansweredCount !== 1 ? "s" : ""} remaining
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
