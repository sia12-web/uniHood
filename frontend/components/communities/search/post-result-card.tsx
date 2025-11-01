"use client";

import type { SearchResultHit } from "@/lib/community-search";
import type { PostSearchSource } from "@/lib/community-search";
import { truncateText } from "@/utils/search";

import { HighlightedText } from "./highlighted-text";

type PostResultCardProps = {
  hit: SearchResultHit<PostSearchSource>;
};

function getHighlight(hit: SearchResultHit<PostSearchSource>, field: string): string | null {
  return hit.highlight?.[field]?.[0] ?? null;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function PostResultCard({ hit }: PostResultCardProps) {
  const post = hit.source;
  const titleHighlight = getHighlight(hit, "title");
  const bodyHighlight = getHighlight(hit, "body");
  const publishedAt = formatDateTime(post.published_at);

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900">
            {titleHighlight ? <HighlightedText value={titleHighlight} /> : post.title ?? "Untitled post"}
          </h3>
          <p className="text-xs uppercase tracking-wide text-slate-400">{post.group_name ?? "Community post"}</p>
        </div>
        {publishedAt ? <p className="text-xs text-slate-500">{publishedAt}</p> : null}
      </header>
      <p className="text-sm text-slate-600">
        {bodyHighlight ? <HighlightedText value={bodyHighlight} /> : truncateText(post.body_trunc ?? "")}
      </p>
      <footer className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {post.campus_name ? <span>{post.campus_name}</span> : null}
        {post.tags?.length ? (
          <span className="flex flex-wrap gap-1">
            {post.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                #{tag}
              </span>
            ))}
            {post.tags.length > 4 ? <span>+{post.tags.length - 4} more</span> : null}
          </span>
        ) : null}
        {typeof post.comment_count === "number" ? <span>{post.comment_count} comments</span> : null}
        {typeof post.reaction_count === "number" ? <span>{post.reaction_count} reactions</span> : null}
        {post.author_name ? <span>By {post.author_name}</span> : null}
      </footer>
    </article>
  );
}
