import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute(
  "/_authenticated/quiz-gen/start/$topicJobId"
)({
  component: QuizGenStartPage,
});

function QuizGenStartPage() {
  const { topicJobId } = Route.useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .post("/api/quiz-gen/start", { topicJobId })
      .then(({ data }) => {
        navigate({
          to: "/quiz-gen/$jobId",
          params: { jobId: data.jobId },
          replace: true,
        });
      })
      .catch((err) => {
        setError(err.response?.data?.error ?? "Something went wrong");
      });
  }, []);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex items-center gap-3 py-8">
      <div className="cq-spinner" />
      <p className="text-sm text-muted-foreground">Generating your quiz…</p>
    </div>
  );
}
