"use client";

import Image from "next/image";

import type { SearchResultHit } from "@/lib/community-search";
import type { GroupSearchSource } from "@/lib/community-search";
import { truncateText } from "@/utils/search";

import { HighlightedText } from "./highlighted-text";

type GroupResultCardProps = {
  hit: SearchResultHit<GroupSearchSource>;
};

function getHighlight(hit: SearchResultHit<GroupSearchSource>, field: string): string | null {
  return hit.highlight?.[field]?.[0] ?? null;
}

export function GroupResultCard({ hit }: GroupResultCardProps) {
  const group = hit.source;
  const nameHighlight = getHighlight(hit, "name");
  const descriptionHighlight = getHighlight(hit, "description");

  return (
    <article className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      {group.hero_image_url ? (
        <div className="relative h-20 w-20 overflow-hidden rounded-xl">
          <Image src={group.hero_image_url} alt="" fill className="object-cover" />
        </div>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-500">
          {group.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3">
        <header className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-slate-900">
            {nameHighlight ? <HighlightedText value={nameHighlight} /> : group.name}
          </h3>
          {group.visibility ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {group.visibility}
            </span>
          ) : null}
        </header>
        <p className="text-sm text-slate-600">
          {descriptionHighlight ? (
            <HighlightedText value={descriptionHighlight} />
          ) : (
            truncateText(group.description ?? "")
          )}
        </p>
        <footer className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {group.campus_name ? <span>{group.campus_name}</span> : null}
          {group.member_count ? <span>{group.member_count} members</span> : null}
          {group.tags?.length ? (
            <span className="flex flex-wrap gap-1">
              {group.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  #{tag}
                </span>
              ))}
              {group.tags.length > 3 ? <span>+{group.tags.length - 3} more</span> : null}
            </span>
          ) : null}
        </footer>
      </div>
    </article>
  );
}
