import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function StartButton({ repoFullName }: { repoFullName: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const { data } = await api.post("/api/quiz/start", { repoFullName });
      navigate({ to: "/quiz/$jobId", params: { jobId: data.jobId } });
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={handleStart} disabled={loading}>
      {loading ? "Starting…" : "Start"}
    </Button>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  const { data: ghStatus, isLoading: ghLoading } = useQuery({
    queryKey: ["github-status"],
    queryFn: () => api.get("/api/github/status").then((r) => r.data),
  });

  const { data: selectedRepos } = useQuery({
    queryKey: ["github-selected"],
    queryFn: () => api.get("/api/github/repos/selected").then((r) => r.data),
    enabled: ghStatus?.connected === true,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete("/api/github/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-selected"] });
    },
  });

  async function handleConnect() {
    const { data } = await api.get("/api/github/connect");
    window.location.href = data.url;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {!meLoading && (
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back, {me?.user?.name}!
          </h1>
          <p className="text-sm text-muted-foreground">
            You're signed in as {me?.user?.email}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>GitHub</CardTitle>
        </CardHeader>
        <CardContent>
          {ghLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : ghStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm">
                Connected as{" "}
                <span className="font-medium">@{ghStatus.username}</span>
              </p>

              {selectedRepos?.repos?.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected repos:</p>
                  {selectedRepos.repos.map(
                    (r: { repoId: string; repoFullName: string }) => (
                      <div
                        key={r.repoId}
                        className="flex items-center justify-between text-sm border rounded px-3 py-2"
                      >
                        <span>{r.repoFullName}</span>
                        <StartButton repoFullName={r.repoFullName} />
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No repos selected yet.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/github/repos" })}
                >
                  Manage repos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Connect your GitHub to get started.
              </p>
              <Button size="sm" onClick={handleConnect}>
                Connect GitHub
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
