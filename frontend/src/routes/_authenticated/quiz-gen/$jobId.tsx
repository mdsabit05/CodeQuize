import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/quiz-gen/$jobId")({
  component: QuizPage,
});

type MCQ   = { type: "mcq";   question: string; options: string[]; correctAnswer: string };
type Short = { type: "short"; question: string; sampleAnswer: string };
type Question = MCQ | Short;

function QuizPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-gen-job", jobId],
    queryFn: () =>
      api.get(`/api/quiz-gen/job/${jobId}`).then((r) => r.data) as Promise<{
        status: string;
        questions: Question[] | null;
        error: string | null;
      }>,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" ? 3000 : false;
    },
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api
        .post(`/api/quiz-gen/${jobId}/submit`, {
          answers: Object.entries(answers).map(([idx, answer]) => ({
            questionIndex: Number(idx),
            answer,
          })),
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      navigate({
        to: "/quiz-gen/attempt/$attemptId",
        params: { attemptId: data.attemptId },
      });
    },
  });

  if (isLoading || data?.status === "pending") {
    return (
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Quiz questions ban rahe hain…</p>
      </div>
    );
  }

  if (data?.status === "error") {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <p className="text-sm text-red-500">Something went wrong: {data.error}</p>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const questions = data?.questions ?? [];
  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i]?.trim());

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Quiz</h1>
        <p className="text-sm text-muted-foreground">Sawal answers karo — phir submit karo</p>
      </div>

      {questions.map((q, i) => (
        <Card key={i}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">
              Q{i + 1}. {q.question}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {q.type === "mcq" ? (
              q.options.map((opt, j) => (
                <label
                  key={j}
                  className={`flex items-center gap-2 text-sm p-2 rounded border cursor-pointer transition-colors ${
                    answers[i] === opt
                      ? "border-indigo-500 bg-indigo-50"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${i}`}
                    value={opt}
                    checked={answers[i] === opt}
                    onChange={() => setAnswers((prev) => ({ ...prev, [i]: opt }))}
                    className="h-4 w-4"
                  />
                  {opt}
                </label>
              ))
            ) : (
              <textarea
                className="w-full border rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={3}
                placeholder="Apna jawab yahan likho…"
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                }
              />
            )}
          </CardContent>
        </Card>
      ))}

      {questions.length > 0 && (
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={!allAnswered || submitMutation.isPending}
        >
          {submitMutation.isPending ? "Submitting…" : "Submit Quiz"}
        </Button>
      )}
    </div>
  );
}
