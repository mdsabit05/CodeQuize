import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute(
  "/_authenticated/quiz-gen/attempt/$attemptId"
)({
  component: AttemptResultPage,
});

type FeedbackItem = { questionIndex: number; correct: boolean; explanation: string };

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
        error: string | null;
      }>,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" ? 3000 : false;
    },
  });

  if (isLoading || data?.status === "pending") {
    return (
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">AI grade kar raha hai…</p>
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

  const score = data?.score ?? 0;
  const feedback = data?.feedback ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Score */}
      <div className="text-center py-6 border rounded-lg">
        <p className="text-5xl font-bold text-indigo-600">{score}%</p>
        <p className="text-sm text-muted-foreground mt-2">
          {score >= 80 ? "Bahut accha!" : score >= 60 ? "Theek hai, aur practice karo" : "Keep learning!"}
        </p>
        <p className="text-sm text-muted-foreground">
          {feedback.filter((f) => f.correct).length}/{feedback.length} correct
        </p>
      </div>

      {/* Feedback per question */}
      <div className="space-y-3">
        {feedback.map((f, i) => (
          <Card key={i} className={f.correct ? "border-green-300" : "border-red-300"}>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span>{f.correct ? "✅" : "❌"}</span>
                Question {f.questionIndex + 1}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-sm text-muted-foreground">{f.explanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
        Back to dashboard
      </Button>
    </div>
  );
}
