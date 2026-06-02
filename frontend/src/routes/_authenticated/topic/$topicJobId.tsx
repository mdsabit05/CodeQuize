import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/topic/$topicJobId")({
  component: TopicJobPage,
});

type Topic = { title: string; description: string };

function TopicJobPage() {
  const { topicJobId } = Route.useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["topic-job", topicJobId],
    queryFn: () =>
      api.get(`/api/topic/job/${topicJobId}`).then((r) => r.data) as Promise<{
        status: string;
        topics: Topic[] | null;
        selectedTopics: string[] | null;
        error: string | null;
      }>,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" ? 3000 : false;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/api/topic/select", {
        topicJobId,
        selectedTopics: selected,
      }),
    onSuccess: () => navigate({ to: "/dashboard" }),
  });

  function toggleTopic(title: string) {
    setSelected((prev) => {
      if (prev.includes(title)) {
        return prev.filter((t) => t !== title);
      }
      if (prev.length >= 2) return prev; // max 2
      return [...prev, title];
    });
  }

  if (isLoading || data?.status === "pending") {
    return (
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Topic ideas generate ho rahi hain…</p>
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

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Topic Ideas</h1>
        <p className="text-sm text-muted-foreground">
          1 ya 2 topics choose karo jo tum likhna chahte ho ({selected.length}/2 selected)
        </p>
      </div>

      <div className="space-y-3">
        {data?.topics?.map((topic, i) => {
          const isSelected = selected.includes(topic.title);
          return (
            <Card
              key={i}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50"
                  : "hover:shadow-md"
              }`}
              onClick={() => toggleTopic(topic.title)}
            >
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                      isSelected
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  {topic.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm text-muted-foreground">{topic.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={selected.length === 0 || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save selection"}
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
