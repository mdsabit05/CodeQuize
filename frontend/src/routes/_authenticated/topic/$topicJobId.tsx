import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute("/_authenticated/topic/$topicJobId")({
  component: TopicJobPage,
});

type Topic = { title: string; description: string };
type LearnData = {
  explanation: { summary: string; keyPoints: string[]; example?: string };
  links: { title: string; url: string; snippet: string }[];
};
type Mode = "normal" | "simple" | "hinglish";

function LearnPanel({ topic }: { topic: string }) {
  const [mode, setMode] = useState<Mode>("normal");

  const { data, isLoading, isError, refetch } = useQuery<LearnData>({
    queryKey: ["topic-learn", topic, mode],
    queryFn: () => api.get("/api/topic/learn", { params: { topic, mode } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const modes: { label: string; value: Mode }[] = [
    { label: "Standard", value: "normal" },
    { label: "Simplify", value: "simple" },
    { label: "🇮🇳 Hinglish", value: "hinglish" },
  ];

  return (
    <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2 flex-wrap items-center">
        {modes.map((btn) => (
          <button key={btn.value} onClick={() => setMode(btn.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
              mode === btn.value
                ? "bg-primary/15 border-primary/40 text-primary font-medium"
                : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-foreground"
            }`}>
            {btn.label}
          </button>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="cq-spinner-sm" /> Loading…
          </div>
        )}
      </div>

      {!isLoading && (isError || !data) ? (
        <p className="text-sm text-destructive">
          Failed to load.{" "}
          <button className="underline hover:no-underline cursor-pointer" onClick={() => refetch()}>Retry</button>
        </p>
      ) : !isLoading && data ? (
        <div className="space-y-4">
          {data.explanation.summary && (
            <p className="text-sm text-foreground/75 leading-relaxed">{data.explanation.summary}</p>
          )}
          {data.explanation.keyPoints?.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Key points</p>
              <ul className="space-y-1.5">
                {data.explanation.keyPoints.map((pt, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-foreground/70">
                    <span className="text-primary/50 shrink-0 mt-0.5">›</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.explanation.example && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Example</p>
              <pre className="text-xs rounded-xl p-3.5 overflow-x-auto whitespace-pre-wrap text-foreground/65 leading-relaxed font-mono"
                style={{ background: "oklch(0.08 0.008 260)", border: "1px solid oklch(1 0 0 / 0.06)" }}>
                {data.explanation.example}
              </pre>
            </div>
          )}
          {data.links?.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Learn more</p>
              {data.links.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="block group" onClick={(e) => e.stopPropagation()}>
                  <span className="text-sm text-primary group-hover:underline font-medium">{link.title}</span>
                  {link.snippet && <span className="block text-xs text-muted-foreground/50 mt-0.5 line-clamp-2">{link.snippet}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TopicJobPage() {
  const { topicJobId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [openLearn, setOpenLearn] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/api/topic/job/${topicJobId}`).then((r) => r.data as { quizJobId: string }),
    onSuccess: ({ quizJobId }) => {
      queryClient.invalidateQueries({ queryKey: ["quiz-progress", quizJobId] });
      if (quizJobId) navigate({ to: "/quiz/$jobId", params: { jobId: quizJobId } });
      else navigate({ to: "/dashboard" });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["topic-job", topicJobId],
    queryFn: () =>
      api.get(`/api/topic/job/${topicJobId}`).then((r) => r.data) as Promise<{
        status: string;
        quizJobId: string | null;
        topics: Topic[] | null;
        selectedTopics: string[] | null;
        error: string | null;
      }>,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.post("/api/topic/select", { topicJobId, selectedTopics: selected }),
    onSuccess: () => navigate({ to: "/quiz-gen/start/$topicJobId", params: { topicJobId } }),
  });

  function toggleTopic(title: string) {
    setSelected((prev) => prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]);
  }

  const topics = data?.topics ?? [];
  const total = topics.length;
  const selPct = total > 0 ? Math.round((selected.length / total) * 100) : 0;

  if (isLoading || data?.status === "pending") {
    return (
      <div className="flex items-center gap-3 py-10">
        <div className="cq-spinner" />
        <p className="text-sm text-muted-foreground">Generating topic ideas…</p>
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

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-6 cq-enter-1">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              if (data?.quizJobId) navigate({ to: "/quiz/$jobId", params: { jobId: data.quizJobId } });
              else navigate({ to: "/dashboard" });
            }}
            className="text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            ← Back
          </button>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="text-xs text-destructive/40 hover:text-destructive/70 transition-colors cursor-pointer"
            >
              Reset concept
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/50">Delete topics & attempts?</span>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="text-xs font-semibold text-destructive hover:text-destructive/80 transition-colors cursor-pointer"
              >
                {resetMutation.isPending ? "Resetting…" : "Yes, reset"}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-muted-foreground/30 mb-1">
          {total} topics generated
        </p>
        <h1 className="text-4xl font-display font-black text-foreground leading-none tracking-tight">
          Pick Your <span className="text-primary">Topics</span>
        </h1>
      </div>

      {/* ── Top widgets ──────────────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6 cq-enter-2">

          {/* LEFT: donut + stats */}
          <div className="rounded-2xl border border-white/[0.06] p-5 flex items-center gap-6"
            style={{ background: "oklch(0.12 0.012 272)" }}>
            <div className="relative shrink-0 w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="oklch(0.20 0.010 260)" strokeWidth="6" />
                <circle cx="40" cy="40" r="32" fill="none"
                  stroke="oklch(0.78 0.17 65)"
                  strokeWidth="6"
                  strokeDasharray={`${(selected.length / total) * 201} 201`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-foreground leading-none">{selected.length}</span>
                <span className="text-[9px] text-muted-foreground/40 font-mono mt-0.5">/{total}</span>
              </div>
            </div>

            <div className="space-y-3 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/30">Selection</p>
              <div className="space-y-2">
                {[
                  { label: "Selected", value: selected.length, col: "oklch(0.78 0.17 65)" },
                  { label: "Remaining", value: total - selected.length, col: "oklch(0.35 0.010 260)" },
                ].map(({ label, value, col }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: col }} />
                      <span className="text-xs text-muted-foreground/50">{label}</span>
                    </div>
                    <span className="text-xs font-bold font-mono" style={{ color: col }}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.18 0.008 260)" }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${selPct}%`, background: "oklch(0.78 0.17 65)" }} />
              </div>
            </div>
          </div>

          {/* RIGHT: info + action */}
          <div className="rounded-2xl border border-white/[0.06] p-5 flex flex-col justify-between"
            style={{ background: "oklch(0.12 0.012 272)" }}>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/30 mb-3">At a Glance</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Topics", value: total, col: "oklch(0.65 0.18 240)" },
                  { label: "Selected", value: selected.length, col: "oklch(0.78 0.17 65)" },
                ].map(({ label, value, col }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5"
                    style={{ background: `${col}0C`, border: `1px solid ${col}18` }}>
                    <p className="text-2xl font-black leading-none" style={{ color: col }}>{value}</p>
                    <p className="text-[10px] text-muted-foreground/40 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              className="cq-btn-primary w-full py-3 text-sm mt-4 cursor-pointer"
              onClick={() => saveMutation.mutate()}
              disabled={selected.length === 0 || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : `Generate quiz with ${selected.length} topic${selected.length !== 1 ? "s" : ""} →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Topic grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        {topics.map((topic, i) => {
          const isSelected = selected.includes(topic.title);
          const isLearning = openLearn === topic.title;

          return (
            <div
              key={i}
              className={`group relative rounded-xl overflow-hidden transition-all duration-150 cursor-pointer cq-enter-${Math.min(i + 3, 5)} ${
                isLearning ? "col-span-2" : ""
              }`}
              style={{
                background: isSelected ? "oklch(0.13 0.015 65 / 50%)" : "oklch(0.115 0.011 272)",
                border: `1px solid ${isSelected ? "oklch(0.78 0.17 65 / 0.25)" : "oklch(1 0 0 / 0.055)"}`,
              }}
              onClick={() => toggleTopic(topic.title)}
            >
              {/* Top accent strip when selected */}
              {isSelected && (
                <div className="h-[2px]" style={{ background: "linear-gradient(90deg, oklch(0.78 0.17 65 / 0.80), transparent)" }} />
              )}
              {!isSelected && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: "oklch(1 0 0 / 0.015)" }} />
              )}

              <div className="px-4 py-4">
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div
                    className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center transition-all"
                    style={{
                      background: isSelected ? "oklch(0.78 0.17 65)" : "transparent",
                      border: `1.5px solid ${isSelected ? "oklch(0.78 0.17 65)" : "oklch(0.35 0.010 260)"}`,
                    }}
                  >
                    {isSelected && <span className="text-black text-[9px] font-black">✓</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-bold leading-snug transition-colors ${
                      isSelected ? "text-foreground" : "text-foreground/85 group-hover:text-foreground"
                    }`}>
                      {topic.title}
                    </p>
                    <p className="text-xs text-muted-foreground/40 mt-1.5 leading-relaxed line-clamp-2">
                      {topic.description}
                    </p>

                    <button
                      className="mt-3 text-[11px] font-semibold cursor-pointer transition-colors"
                      style={{ color: isLearning ? "oklch(0.78 0.17 65)" : "oklch(0.45 0.010 260)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenLearn((prev) => prev === topic.title ? null : topic.title);
                      }}
                    >
                      {isLearning ? "▲ Hide study notes" : "▼ Study before quiz"}
                    </button>

                    {isLearning && <LearnPanel topic={topic.title} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
