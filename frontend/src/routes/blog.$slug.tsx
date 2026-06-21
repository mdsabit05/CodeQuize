import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

type BlogPost = {
  blogTitle: string;
  blogSlug: string;
  blogBody: string;
  publishedAt: string;
};

function renderMarkdown(text: string): React.ReactNode[] {
  return text.split("\n").map((line, i) => {
    const key = i;
    if (line.startsWith("# ")) return <h1 key={key} className="text-3xl font-bold mt-8 mb-4">{line.slice(2)}</h1>;
    if (line.startsWith("## ")) return <h2 key={key} className="text-2xl font-bold mt-6 mb-3">{line.slice(3)}</h2>;
    if (line.startsWith("### ")) return <h3 key={key} className="text-xl font-semibold mt-4 mb-2">{line.slice(4)}</h3>;
    if (line.startsWith("```") || line === "```") return null;
    if (line.trim() === "") return <div key={key} className="mb-3" />;
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={j}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={j} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{part.slice(1, -1)}</code>;
      return part;
    });
    return <p key={key} className="mb-3 leading-relaxed text-foreground">{parts}</p>;
  }).filter(Boolean) as React.ReactNode[];
}

function BlogPage() {
  const { slug } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["blog", slug],
    queryFn: () => api.get(`/api/posts/blog/${slug}`).then((r) => r.data) as Promise<BlogPost>,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-semibold text-foreground mb-2">Post not found</p>
        <p className="text-muted-foreground">This post may not be published yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <header className="mb-10">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-3">CodeQuize Blog</p>
        <h1 className="text-4xl font-black text-foreground leading-tight mb-4">{data.blogTitle}</h1>
        <p className="text-sm text-muted-foreground">
          Published {new Date(data.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </header>
      <article className="prose prose-sm max-w-none">
        {renderMarkdown(data.blogBody)}
      </article>
    </div>
  );
}

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPage,
});
