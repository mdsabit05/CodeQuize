import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex justify-between items-center">
        <span className="font-semibold">App</span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
