import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-medium">Name:</span> {data?.user?.name}
              </p>
              <p>
                <span className="font-medium">Email:</span> {data?.user?.email}
              </p>
              <p>
                <span className="font-medium">ID:</span> {data?.user?.id}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
