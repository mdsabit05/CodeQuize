import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/quiz/$jobId")({
  component: QuizJobPage,
});

type Concept = { title: string; description: string };

function QuizJobPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-job", jobId],
    queryFn: () =>
      api.get(`/api/quiz/job/${jobId}`).then((r) => r.data) as Promise<{
        status: string;
        concepts: Concept[] | null;
        error: string | null;
      }>,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" ? 3000 : false;
    },
  });

  if (isLoading || data?.status === "pending") {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">
            Reading your code and finding concepts…
          </p>
        </div>
      </div>
    );
  }

  if (data?.status === "error") {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-red-500">Something went wrong: {data.error}</p>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Concepts from your code</h1>
        <p className="text-sm text-muted-foreground">
          Found {data?.concepts?.length ?? 0} concepts in recent commits
        </p>
      </div>

      <div className="space-y-3">
        {data?.concepts?.map((concept, i) => (
          <Card
            key={i}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() =>
              navigate({
                to: "/topic/start/$quizJobId/$conceptIndex",
                params: { quizJobId: jobId, conceptIndex: String(i) },
              })
            }
          >
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-base">{concept.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm text-muted-foreground">{concept.description}</p>
              <p className="text-xs text-indigo-500 mt-2">Click to get topic ideas →</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
        Back to dashboard
      </Button>
    </div>
  );
}
