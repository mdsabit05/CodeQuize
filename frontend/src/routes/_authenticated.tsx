import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (!session) {
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 h-16 border-b border-border/40 bg-background/90 backdrop-blur-md flex items-center justify-between px-8">
        <a
          href="/dashboard"
          className="flex items-center gap-3 hover:opacity-75 transition-opacity group"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl border border-primary/25 bg-primary/10 cq-logo-glow">
            <span
              className="text-primary text-sm font-bold"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              &lt;/&gt;
            </span>
          </div>
          <span
            className="font-bold text-base tracking-[0.2em] uppercase text-foreground"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            CodeQuize
          </span>
        </a>

        <button
          onClick={handleSignOut}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          Sign out
        </button>
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
