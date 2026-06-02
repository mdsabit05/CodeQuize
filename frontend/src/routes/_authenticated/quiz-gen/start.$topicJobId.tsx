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
        });
      })
      .catch((err) => {
        setError(err.response?.data?.error ?? "Something went wrong");
      });
  }, []);

  if (error) return <div className="max-w-2xl mx-auto"><p className="text-sm text-red-500">{error}</p></div>;

  return (
    <div className="max-w-2xl mx-auto flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Quiz generate ho raha hai…</p>
    </div>
  );
}
