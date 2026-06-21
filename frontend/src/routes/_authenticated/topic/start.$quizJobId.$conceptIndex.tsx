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
      <p className="text-sm text-muted-foreground">Starting…</p>
    </div>
  );
}
