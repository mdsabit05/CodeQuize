import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

type LearningResource = { title: string; url: string; description: string };
type LearningLinkItem = { questionIndex: number; topic: string; resources: LearningResource[] };

function uselearningLinks(attemptId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["learning-links", attemptId],
    enabled,
    queryFn: () =>
      api.get(`/api/learning/links/${attemptId}`).then((r) => r.data) as Promise<{
        status: string;
        links: LearningLinkItem[] | null;
      }>,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });
}

function InlineResources({ resources }: { resources: LearningResource[] }) {
  return (
    <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-2.5">Learning resources</p>
      <div className="space-y-1">
        {resources.map((r, i) => (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group"
            style={{ border: "1px solid oklch(1 0 0 / 0.05)", background: "oklch(0.09 0.008 260)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary group-hover:underline truncate">{r.title}</p>
              <p className="text-xs text-muted-foreground/50 mt-0.5 line-clamp-2">{r.description}</p>
            </div>
            <span className="text-muted-foreground/30 group-hover:text-primary/50 shrink-0 transition-colors mt-0.5 text-xs">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}

type PostDraft = {
  status: string;
  blogTitle: string | null;
  blogSlug: string | null;
  blogBody: string | null;
  linkedinBody: string | null;
  twitterBody: string | null;
  publishedAt: string | null;
  error: string | null;
};

type ShareResult = { blogUrl: string; linkedinPosted: boolean; twitterPosted: boolean; errors: string[] };
type PlatformShareState = { confirming: boolean; result: ShareResult | null; error: string | null; pending: boolean };

function ShareButton({ label, confirmMsg, onConfirm, state, onSetConfirming, disabled }: {
  label: string; confirmMsg: string; onConfirm: () => void;
  state: PlatformShareState; onSetConfirming: (v: boolean) => void; disabled?: boolean;
}) {
  if (state.result) return <p className="text-sm text-accent font-medium mt-3">✓ Shared successfully</p>;
  if (state.confirming) {
    return (
      <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
        <p className="text-sm text-foreground/80">{confirmMsg}</p>
        <div className="flex gap-2">
          <button className="cq-btn-primary flex-1 py-2 text-sm" onClick={onConfirm} disabled={state.pending}>
            {state.pending ? "Sharing…" : "Yes, share"}
          </button>
          <button className="cq-btn-secondary flex-1 py-2 text-sm" onClick={() => onSetConfirming(false)}>Cancel</button>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    );
  }
  return (
    <button
      className="mt-3 w-full cq-btn-secondary text-sm py-2"
      onClick={() => onSetConfirming(true)}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function PostsSection({ attemptId }: { attemptId: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["post-draft", attemptId],
    queryFn: () => api.get(`/api/posts/${attemptId}`).then((r) => r.data) as Promise<PostDraft>,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });

  const { data: socialStatus } = useQuery({
    queryKey: ["social-status"],
    queryFn: () => api.get("/api/social/status").then((r) => r.data) as Promise<{ linkedin: boolean; twitter: boolean }>,
    enabled: data?.status === "done",
  });

  const [blogTitle, setBlogTitle] = useState("");
  const [blogSlug, setBlogSlug] = useState("");
  const [blogBody, setBlogBody] = useState("");
  const [linkedinBody, setLinkedinBody] = useState("");
  const [twitterBody, setTwitterBody] = useState("");
  const [seeded, setSeeded] = useState(false);

  const emptyShare: PlatformShareState = { confirming: false, result: null, error: null, pending: false };
  const [blogShare, setBlogShare] = useState<PlatformShareState>(emptyShare);
  const [liShare, setLiShare] = useState<PlatformShareState>(emptyShare);
  const [twShare, setTwShare] = useState<PlatformShareState>(emptyShare);

  useEffect(() => {
    if (data?.status === "done" && !seeded) {
      setBlogTitle(data.blogTitle ?? "");
      setBlogSlug(data.blogSlug ?? "");
      setBlogBody(data.blogBody ?? "");
      setLinkedinBody(data.linkedinBody ?? "");
      setTwitterBody(data.twitterBody ?? "");
      setSeeded(true);
    }
  }, [data, seeded]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/api/posts/${attemptId}`, { blogTitle, blogSlug, blogBody, linkedinBody, twitterBody }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["post-draft", attemptId] }),
  });

  const doShare = async (platform: "blog" | "linkedin" | "twitter", setState: React.Dispatch<React.SetStateAction<PlatformShareState>>) => {
    setState((s) => ({ ...s, pending: true, error: null }));
    try {
      const result = await api.post(`/api/posts/${attemptId}/share`, { platform }).then((r) => r.data) as ShareResult;
      setState({ confirming: false, result, error: null, pending: false });
      queryClient.invalidateQueries({ queryKey: ["post-draft", attemptId] });
    } catch (err: any) {
      setState((s) => ({ ...s, pending: false, error: err?.response?.data?.error ?? String(err) }));
    }
  };

  const returnUrl = `/quiz-gen/attempt/${attemptId}`;
  if (!data || data.status === "none") return null;

  if (data.status === "pending") {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
        <div className="cq-spinner-sm" /> Writing your posts…
      </div>
    );
  }
  if (data.status === "error") return <p className="text-sm text-destructive">Could not generate posts: {data.error}</p>;

  const twitterOver = twitterBody.length > 280;

  const PanelHeader = ({ label, connected, connectUrl }: { label: string; connected?: boolean; connectUrl?: string }) => (
    <div className="cq-card-header justify-between">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {connected !== undefined && (
        connected
          ? <span className="cq-badge cq-badge-green">● Connected</span>
          : <a href={connectUrl} className="text-sm text-primary hover:underline font-medium">Connect →</a>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Your posts</h2>
        <button
          className="cq-btn-secondary text-sm py-1.5 px-4"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || twitterOver}
        >
          {saveMutation.isPending ? "Saving…" : saveMutation.isSuccess ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      {/* Blog */}
      <div className="cq-card">
        <PanelHeader label="📝 Blog post" />
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Title</label>
            <input value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} className="cq-input" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Slug</label>
            <input value={blogSlug} onChange={(e) => setBlogSlug(e.target.value)} className="cq-input font-mono text-sm" placeholder="my-first-post" />
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens only</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Body (Markdown)</label>
            <textarea value={blogBody} onChange={(e) => setBlogBody(e.target.value)} rows={10}
              className="cq-input resize-y font-mono text-xs leading-relaxed" style={{ minHeight: '200px' }} />
          </div>
          {data.publishedAt ? (
            <p className="text-sm text-accent">
              ✓ Published ·{" "}
              <a href={`/blog/${blogSlug}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View post →</a>
            </p>
          ) : (
            <ShareButton label="Publish to blog" confirmMsg="This will make your post publicly visible. Can't be undone."
              onConfirm={() => doShare("blog", setBlogShare)} state={blogShare} onSetConfirming={(v) => setBlogShare((s) => ({ ...s, confirming: v }))} />
          )}
        </div>
      </div>

      {/* LinkedIn */}
      <div className="cq-card">
        <PanelHeader label="💼 LinkedIn" connected={socialStatus?.linkedin}
          connectUrl={`/api/social/linkedin/connect?returnUrl=${encodeURIComponent(returnUrl)}`} />
        <div className="p-5">
          <textarea value={linkedinBody} onChange={(e) => setLinkedinBody(e.target.value)} rows={6} className="cq-input resize-y" />
          {socialStatus?.linkedin ? (
            <ShareButton label="Post to LinkedIn" confirmMsg="This will post to your LinkedIn profile."
              onConfirm={() => doShare("linkedin", setLiShare)} state={liShare} onSetConfirming={(v) => setLiShare((s) => ({ ...s, confirming: v }))} />
          ) : (
            <p className="text-sm text-muted-foreground mt-3">Connect LinkedIn above to share.</p>
          )}
        </div>
      </div>

      {/* Twitter */}
      <div className="cq-card">
        <div className="cq-card-header justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-foreground">𝕏 Twitter / X</p>
            <span className={`text-xs font-mono font-semibold ${twitterOver ? "text-destructive" : "text-muted-foreground"}`}>
              {twitterBody.length}/280
            </span>
          </div>
          {socialStatus !== undefined && (
            socialStatus.twitter
              ? <span className="cq-badge cq-badge-green">● Connected</span>
              : <a href={`/api/social/twitter/connect?returnUrl=${encodeURIComponent(returnUrl)}`} className="text-sm text-primary hover:underline font-medium">Connect →</a>
          )}
        </div>
        <div className="p-5">
          <textarea value={twitterBody} onChange={(e) => setTwitterBody(e.target.value)} rows={4}
            className={`cq-input resize-y ${twitterOver ? "border-destructive/60" : ""}`} />
          {socialStatus?.twitter ? (
            <ShareButton label="Post to Twitter / X" confirmMsg="This will post to your Twitter/X account."
              onConfirm={() => doShare("twitter", setTwShare)} state={twShare} onSetConfirming={(v) => setTwShare((s) => ({ ...s, confirming: v }))} disabled={twitterOver} />
          ) : (
            <p className="text-sm text-muted-foreground mt-3">Connect Twitter above to share.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/quiz-gen/attempt/$attemptId")({
  component: AttemptResultPage,
});

type FeedbackItem = {
  questionIndex: number;
  question?: string;
  userAnswer?: string;
  correct: boolean;
  explanation?: string;
  verdict?: string;
  correct_answer?: string;
  analogy?: string;
  why_it_exists?: string;
  code_breakdown?: string;
  common_mistakes?: string;
  summary?: string;
};

function renderText(text: string): React.ReactNode[] {
  const segments = text.split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) return <strong key={i}>{seg.slice(2, -2)}</strong>;
    if (seg.startsWith("*") && seg.endsWith("*")) return <em key={i}>{seg.slice(1, -1)}</em>;
    if (seg.startsWith("`") && seg.endsWith("`"))
      return <code key={i} className="bg-muted/60 text-foreground text-xs px-1.5 py-0.5 rounded font-mono">{seg.slice(1, -1)}</code>;
    return seg;
  });
}

function CodeBreakdown({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2.5">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const code = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
          return <pre key={i} className="bg-[oklch(0.07_0.008_260)] text-foreground/80 text-xs rounded-lg px-4 py-3.5 overflow-x-auto font-mono leading-relaxed">{code}</pre>;
        }
        if (part.trim()) return <p key={i} className="text-sm leading-relaxed">{renderText(part)}</p>;
        return null;
      })}
    </div>
  );
}

function FeedbackSection({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span>{label}
      </p>
      <div className="text-sm leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}

function StructuredExplanation({ f }: { f: FeedbackItem }) {
  if (!f.verdict) {
    return <p className="text-sm text-muted-foreground leading-relaxed">{renderText(f.explanation ?? "")}</p>;
  }
  return (
    <div className="space-y-4 pt-1">
      <p className={`text-sm font-medium leading-relaxed ${f.correct ? "text-accent" : "text-destructive"}`}>
        {renderText(f.verdict)}
      </p>
      {!f.correct && f.correct_answer && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-primary/70">✓ Correct answer</p>
          <CodeBreakdown text={f.correct_answer} />
        </div>
      )}
      {f.analogy && <FeedbackSection icon="💡" label="Real-world analogy">{renderText(f.analogy)}</FeedbackSection>}
      {f.why_it_exists && <FeedbackSection icon="🤔" label="Why it exists">{renderText(f.why_it_exists)}</FeedbackSection>}
      {f.code_breakdown && <FeedbackSection icon="🧩" label="Code breakdown"><CodeBreakdown text={f.code_breakdown} /></FeedbackSection>}
      {f.common_mistakes && <FeedbackSection icon="⚠️" label="Common mistake">{renderText(f.common_mistakes)}</FeedbackSection>}
      {f.summary && (
        <div className="bg-muted/30 border border-border/50 rounded-lg px-4 py-3 flex items-start gap-2.5">
          <span className="shrink-0">📌</span>
          <p className="text-sm font-medium text-foreground">{renderText(f.summary)}</p>
        </div>
      )}
    </div>
  );
}

function Countdown({ initialSeconds, onExpire }: { initialSeconds: number; onExpire: () => void }) {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => { setSecs(initialSeconds); }, [initialSeconds]);
  useEffect(() => {
    if (secs <= 0) { onExpire(); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const display = h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
    : `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;

  return (
    <div className="space-y-1">
      <p className="text-3xl font-black font-mono text-primary cq-score-pulse leading-none">{display}</p>
      <p className="text-xs text-muted-foreground/50">until you can retry</p>
    </div>
  );
}

function RetrySidebar({ topicJobId, correctCount, total }: { topicJobId: string; correctCount: number; total: number }) {
  const navigate = useNavigate();
  const [localExpired, setLocalExpired] = useState(false);

  const { data: retryStatus, refetch } = useQuery({
    queryKey: ["retry-status", topicJobId],
    queryFn: () => api.get(`/api/quiz-gen/retry-status/${topicJobId}`).then((r) => r.data) as Promise<{
      canRetry: boolean; waitSecondsLeft: number | null; passed: boolean;
    }>,
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: () => api.post(`/api/quiz-gen/retry/${topicJobId}`).then((r) => r.data as { jobId: string }),
    onSuccess: ({ jobId }) => navigate({ to: "/quiz-gen/$jobId", params: { jobId } }),
  });

  const canRetry = retryStatus?.canRetry || localExpired;
  const secsLeft = retryStatus?.waitSecondsLeft ?? null;
  const wrongCount = total - correctCount;

  return (
    <div className="space-y-3">
      {/* Stats card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "oklch(0.12 0.012 272)", border: "1px solid oklch(1 0 0 / 0.07)" }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "oklch(1 0 0 / 0.06)" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">Breakdown</p>
        </div>
        <div className="p-4 space-y-3">
          {[
            { label: "Correct", value: correctCount, col: "oklch(0.70 0.22 145)" },
            { label: "Incorrect", value: wrongCount, col: "oklch(0.60 0.22 27)" },
            { label: "Total", value: total, col: "oklch(0.65 0.18 240)" },
          ].map(({ label, value, col }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col }} />
                <span className="text-xs text-muted-foreground/60">{label}</span>
              </div>
              <span className="text-sm font-bold font-mono" style={{ color: col }}>{value}</span>
            </div>
          ))}
          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "oklch(0.18 0.008 260)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${total > 0 ? (correctCount / total) * 100 : 0}%`, background: "oklch(0.70 0.22 145)" }} />
          </div>
        </div>
      </div>

      {/* Retry card */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "oklch(0.12 0.012 272)",
        border: "1px solid oklch(0.78 0.17 65 / 0.15)",
        boxShadow: "0 0 40px oklch(0.78 0.17 65 / 0.05)",
      }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "oklch(0.78 0.17 65 / 0.10)" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">Retry</p>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Try again</p>
            <p className="text-xs text-muted-foreground/50 mt-1 leading-relaxed">Need 80% to pass. Fresh questions will be generated.</p>
          </div>

          {canRetry ? (
            <button
              className="cq-btn-primary w-full py-2.5 text-sm cursor-pointer"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? "Generating…" : "Start new quiz →"}
            </button>
          ) : secsLeft !== null ? (
            <div className="space-y-3">
              <div className="rounded-xl p-3.5" style={{ background: "oklch(0.09 0.008 260)", border: "1px solid oklch(0.78 0.17 65 / 0.12)" }}>
                <Countdown initialSeconds={secsLeft} onExpire={() => { setLocalExpired(true); refetch(); }} />
              </div>
              <p className="text-xs text-muted-foreground/40 leading-relaxed">Study the explanations to the left while you wait.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttemptResultPage() {
  const { attemptId } = Route.useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-attempt", attemptId],
    queryFn: () =>
      api.get(`/api/quiz-gen/attempt/${attemptId}`).then((r) => r.data) as Promise<{
        status: string;
        score: number | null;
        feedback: FeedbackItem[] | null;
        answers: { questionIndex: number; answer: string }[] | null;
        questions: { type: string; question: string; options?: string[] }[] | null;
        error: string | null;
        topicJobId: string;
        quizJobId: string | null;
      }>,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });

  const score = data?.score ?? 0;
  const passed = score >= 80;
  const quizJobId = data?.quizJobId ?? null;

  const { data: linksData } = uselearningLinks(attemptId, data?.status === "done");
  const linksByQuestion = new Map<number, LearningResource[]>();
  if (linksData?.links) {
    for (const item of linksData.links) linksByQuestion.set(item.questionIndex, item.resources);
  }

  function goBack() {
    if (quizJobId) navigate({ to: "/quiz/$jobId", params: { jobId: quizJobId } });
    else navigate({ to: "/dashboard" });
  }

  if (isLoading || data?.status === "pending") {
    return (
      <div className="max-w-5xl mx-auto flex items-center gap-3 py-12">
        <div className="cq-spinner" />
        <p className="text-sm text-muted-foreground">Grading your answers…</p>
      </div>
    );
  }

  if (data?.status === "error") {
    return (
      <div className="max-w-5xl mx-auto space-y-3 py-12">
        <p className="text-sm text-destructive">Something went wrong: {data.error}</p>
        <button className="cq-btn-secondary text-sm" onClick={() => navigate({ to: "/dashboard" })}>← Dashboard</button>
      </div>
    );
  }

  const feedback = data?.feedback ?? [];
  const questions = data?.questions ?? [];
  const answersByIndex = new Map((data?.answers ?? []).map((a) => [a.questionIndex, a.answer]));
  const correctCount = feedback.filter((f) => f.correct).length;
  const total = feedback.length;

  const scoreColor = passed ? "oklch(0.70 0.22 145)" : score >= 60 ? "oklch(0.78 0.17 65)" : "oklch(0.60 0.22 27)";
  const scoreBgGlow = passed ? "oklch(0.70 0.22 145 / 0.08)" : score >= 60 ? "oklch(0.78 0.17 65 / 0.08)" : "oklch(0.60 0.22 27 / 0.08)";
  const scoreBorderColor = passed ? "oklch(0.70 0.22 145 / 0.25)" : score >= 60 ? "oklch(0.78 0.17 65 / 0.25)" : "oklch(0.60 0.22 27 / 0.25)";
  const scoreLabel = passed ? "Passed" : score >= 60 ? "Not quite" : "Keep going";
  const scoreSub = passed ? "You understand this concept — time to write about it" : score >= 60 ? "Review the explanations, then retry" : "Study the breakdowns carefully before you retry";

  return (
    <div className="pb-12 max-w-5xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-6 cq-enter-1">
        <button
          onClick={goBack}
          className="text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer flex items-center gap-1.5 mb-4"
        >
          ← {quizJobId ? "Back to concepts" : "Back to dashboard"}
        </button>
        <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-muted-foreground/30 mb-1">
          Quiz result
        </p>
        <h1 className="text-4xl font-display font-black text-foreground leading-none tracking-tight">
          Your <span className="text-primary">Score</span>
        </h1>
      </div>

      {/* ── Score hero ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-6 cq-enter-1" style={{
        background: `linear-gradient(135deg, ${scoreBgGlow}, oklch(0.115 0.011 272))`,
        border: `1px solid ${scoreBorderColor}`,
      }}>
        <div className="px-6 py-5 flex items-center gap-6">
          {/* Big score */}
          <div className="shrink-0">
            <p className="font-black font-display leading-none tracking-tight cq-score-pulse"
              style={{ fontSize: "clamp(56px, 10vw, 96px)", color: scoreColor }}>
              {score}%
            </p>
          </div>
          {/* Divider */}
          <div className="w-px self-stretch" style={{ background: `${scoreColor.replace(")", " / 0.15)")}` }} />
          {/* Info */}
          <div className="space-y-2">
            <p className="text-xl font-display font-bold" style={{ color: scoreColor }}>{scoreLabel}</p>
            <p className="text-sm text-muted-foreground/70 leading-relaxed">{scoreSub}</p>
            <div className="flex items-center gap-4 pt-1">
              <span className="text-xs font-mono text-muted-foreground/50">
                <span className="font-bold text-foreground/80">{correctCount}</span> / {total} correct
              </span>
              <span className="text-xs font-mono text-muted-foreground/30">·</span>
              <span className="text-xs font-mono text-muted-foreground/50">
                Need <span className="font-bold text-foreground/60">80%</span> to pass
              </span>
            </div>
          </div>
          {/* Mini ring */}
          <div className="ml-auto shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="oklch(0.18 0.008 260)" strokeWidth="5" />
              <circle cx="32" cy="32" r="26" fill="none"
                stroke={scoreColor}
                strokeWidth="5"
                strokeDasharray={`${(score / 100) * 163.4} 163.4`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Passed: completion banner ───────────────────────────────── */}
      {passed && (
        <div className="rounded-2xl px-5 py-4 mb-6 flex items-center gap-4 cq-enter-2"
          style={{ background: "oklch(0.70 0.22 145 / 0.08)", border: "1px solid oklch(0.70 0.22 145 / 0.20)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base"
            style={{ background: "oklch(0.70 0.22 145 / 0.15)" }}>🎉</div>
          <div>
            <p className="text-sm font-bold" style={{ color: "oklch(0.70 0.22 145)" }}>Topic complete!</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Review and edit your posts below before sharing.</p>
          </div>
          <button className="ml-auto cq-btn-secondary text-sm py-1.5 px-4 shrink-0 cursor-pointer" onClick={goBack}>
            {quizJobId ? "← Back to concepts" : "← Dashboard"}
          </button>
        </div>
      )}

      {/* ── Main 2-col layout ──────────────────────────────────────── */}
      <div className={`flex gap-5 items-start cq-enter-2 ${!passed && data?.topicJobId ? "" : ""}`}>

        {/* LEFT: question breakdown */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40 px-1 mb-3">
            Question breakdown · {total} questions
          </p>

          {feedback.map((f) => {
            const questionText = f.question ?? questions[f.questionIndex]?.question ?? "";
            const userAnswer = f.userAnswer ?? answersByIndex.get(f.questionIndex) ?? "";

            return (
              <div
                key={f.questionIndex}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "oklch(0.115 0.011 272)",
                  border: `1px solid ${f.correct ? "oklch(0.70 0.22 145 / 0.20)" : "oklch(0.60 0.22 27 / 0.20)"}`,
                  borderLeft: `3px solid ${f.correct ? "oklch(0.70 0.22 145)" : "oklch(0.60 0.22 27)"}`,
                }}
              >
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`cq-badge ${f.correct ? "cq-badge-green" : "cq-badge-red"}`}>
                      {f.correct ? "✓ Correct" : "✗ Incorrect"}
                    </span>
                    <span className="text-xs text-muted-foreground/40 font-mono">Q{f.questionIndex + 1}</span>
                  </div>

                  {questionText && (
                    <div className="mb-4 rounded-lg p-4 space-y-2"
                      style={{ background: "oklch(0.09 0.008 260)", border: "1px solid oklch(1 0 0 / 0.05)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">Question</p>
                      <p className="text-sm text-foreground font-medium leading-relaxed">{questionText}</p>
                      {userAnswer && (
                        <div className="pt-2.5 border-t" style={{ borderColor: "oklch(1 0 0 / 0.05)" }}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Your answer</p>
                          <p className="text-sm text-foreground/65 leading-relaxed">{userAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <StructuredExplanation f={f} />

                  {!f.correct && linksByQuestion.has(f.questionIndex) && (
                    <InlineResources resources={linksByQuestion.get(f.questionIndex)!} />
                  )}
                  {!f.correct && !linksByQuestion.has(f.questionIndex) && (!linksData || linksData.status === "pending") && (
                    <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-2.5 text-sm text-muted-foreground/50">
                      <div className="cq-spinner-sm" />
                      Finding learning resources…
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT: sticky sidebar */}
        {!passed && data?.topicJobId && (
          <div className="w-64 shrink-0 sticky top-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40 px-1 mb-3">Actions</p>
            <RetrySidebar topicJobId={data.topicJobId} correctCount={correctCount} total={total} />
          </div>
        )}

        {passed && (
          <div className="w-64 shrink-0 sticky top-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40 px-1 mb-3">Stats</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: "oklch(0.12 0.012 272)", border: "1px solid oklch(0.70 0.22 145 / 0.15)" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "oklch(0.70 0.22 145 / 0.10)" }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">Breakdown</p>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { label: "Correct", value: correctCount, col: "oklch(0.70 0.22 145)" },
                  { label: "Incorrect", value: total - correctCount, col: "oklch(0.60 0.22 27)" },
                  { label: "Total", value: total, col: "oklch(0.65 0.18 240)" },
                ].map(({ label, value, col }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col }} />
                      <span className="text-xs text-muted-foreground/60">{label}</span>
                    </div>
                    <span className="text-sm font-bold font-mono" style={{ color: col }}>{value}</span>
                  </div>
                ))}
                <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "oklch(0.18 0.008 260)" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${total > 0 ? (correctCount / total) * 100 : 0}%`, background: "oklch(0.70 0.22 145)" }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Posts (passed only) ────────────────────────────────────── */}
      {passed && (
        <div className="mt-8 space-y-5 cq-enter-3">
          <PostsSection attemptId={attemptId} />
        </div>
      )}
    </div>
  );
}
