import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/github/repos")({
  component: RepoPickerPage,
});

type Repo = {
  repoId: string;
  repoName: string;
  repoFullName: string;
};

function RepoPickerPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: reposData, isLoading } = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => api.get("/api/github/repos").then((r) => r.data),
  });

  const { data: savedData } = useQuery({
    queryKey: ["github-selected"],
    queryFn: () => api.get("/api/github/repos/selected").then((r) => r.data),
  });

  useEffect(() => {
    if (savedData?.repos) {
      setSelected(new Set(savedData.repos.map((r: Repo) => r.repoId)));
    }
  }, [savedData]);

  const saveMutation = useMutation({
    mutationFn: (repos: Repo[]) =>
      api.post("/api/github/repos/select", { repos }),
    onSuccess: () => navigate({ to: "/dashboard" }),
  });

  function toggle(repo: Repo) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo.repoId)) {
        next.delete(repo.repoId);
      } else {
        next.add(repo.repoId);
      }
      return next;
    });
  }

  function handleSave() {
    const repos = (reposData?.repos ?? []).filter((r: Repo) =>
      selected.has(r.repoId)
    );
    saveMutation.mutate(repos);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Choose repos to share</CardTitle>
          <CardDescription>
            Only public repos are shown. Select the ones you want to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading repos…</p>
          ) : reposData?.repos?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No public repos found.
            </p>
          ) : (
            reposData?.repos?.map((repo: Repo) => (
              <label
                key={repo.repoId}
                className="flex items-center gap-3 border rounded px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(repo.repoId)}
                  onChange={() => toggle(repo)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{repo.repoFullName}</span>
              </label>
            ))
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save selection"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
