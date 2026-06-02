import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/axios";

export const Route = createFileRoute(
  "/_authenticated/topic/start/$quizJobId/$conceptIndex"
)({
  component: TopicStartPage,
});

function TopicStartPage() {
  const { quizJobId, conceptIndex } = Route.useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .post("/api/topic/start", {
        quizJobId,
        conceptIndex: Number(conceptIndex),
      })
      .then(({ data }) => {
        navigate({
          to: "/topic/$topicJobId",
          params: { topicJobId: data.jobId },
        });
      })
      .catch((err) => {
        setError(err.response?.data?.error ?? "Something went wrong");
      });
  }, []);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Starting…</p>
    </div>
  );
}
