import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(err.message ?? "Sign in failed");
      setLoading(false);
      return;
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">

      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(oklch(0.78 0.17 65) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.17 65) 1px, transparent 1px)`,
          backgroundSize: '56px 56px',
        }}
      />

      {/* Ambient amber glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.06]"
        style={{ background: 'oklch(0.78 0.17 65)' }}
      />

      {/* Corner accent lines */}
      <div className="absolute top-8 left-8 w-12 h-12 border-t border-l border-primary/20" />
      <div className="absolute top-8 right-8 w-12 h-12 border-t border-r border-primary/20" />
      <div className="absolute bottom-8 left-8 w-12 h-12 border-b border-l border-primary/20" />
      <div className="absolute bottom-8 right-8 w-12 h-12 border-b border-r border-primary/20" />

      <div className="relative w-full max-w-sm mx-auto px-6">

        {/* Logo block */}
        <div className="text-center mb-10 cq-enter-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-primary/25 bg-primary/8 mb-5 cq-logo-glow">
            <span
              className="text-primary font-bold text-xl"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              &lt;/&gt;
            </span>
          </div>
          <h1
            className="text-[2.6rem] font-bold tracking-[0.12em] uppercase text-foreground leading-none mb-3"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            CodeQuize
          </h1>
          <p className="text-muted-foreground text-sm tracking-wide">
            Turn your code into mastery
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={onSubmit}
          className="border border-border bg-card rounded-xl p-6 space-y-4 cq-enter-2"
          style={{ boxShadow: '0 0 0 1px oklch(0.22 0.008 260 / 60%), 0 24px 48px oklch(0 0 0 / 40%)' }}
        >
          {error && (
            <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3.5 py-2.5 cq-enter-1">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/12 transition-all"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/12 transition-all"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-[0.14em] hover:bg-primary/90 disabled:opacity-50 transition-all glow-amber"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </div>
    </div>
  );
}
