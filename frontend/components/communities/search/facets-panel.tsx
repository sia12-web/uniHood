"use client";

import clsx from "clsx";

import type { SearchFacet } from "@/lib/community-search";
import type { NormalizedSearchParams, SearchScope } from "@/utils/search";

export type FacetsPanelProps = {
  scope: SearchScope;
  facets?: Record<string, SearchFacet> | null;
  selected: NormalizedSearchParams;
  onCampusSelect(value: string | null): void;
  onTagToggle(value: string): void;
};

function renderFacetTitle(field: string): string {
  if (field === "campus_id") {
    return "Campus";
  }
  if (field === "tags") {
    return "Tags";
  }
  if (field === "time_range") {
    return "Time";
  }
  return field.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function FacetsPanel({ scope, facets, selected, onCampusSelect, onTagToggle }: FacetsPanelProps) {
  if (!facets) {
    return null;
  }
  const entries = Object.entries(facets);
  if (entries.length === 0) {
    return null;
  }

  return (
    <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Facets</h2>
        <p className="text-xs text-slate-500">Refine using popular filters.</p>
      </header>
      <div className="space-y-6">
        {entries.map(([field, facet]) => {
          if (!facet || !facet.buckets || facet.buckets.length === 0) {
            return null;
          }
          const title = renderFacetTitle(field);
          return (
            <section key={field} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
              <ul className="space-y-2">
                {facet.buckets.slice(0, 8).map((bucket) => {
                  const activeCampus = selected.campus_id === bucket.value;
                  const activeTag = selected.tags.includes(bucket.value);
                  const isActive = field === "campus_id" ? activeCampus : activeTag;
                  const label = bucket.label ?? bucket.value;
                  const countLabel = bucket.count.toLocaleString();

                  const handleClick = () => {
                    if (field === "campus_id") {
                      onCampusSelect(isActive ? null : bucket.value);
                    } else if (field === "tags") {
                      onTagToggle(bucket.value);
                    }
                  };

                  const disabled = field === "tags" && scope !== "posts";

                  return (
                    <li key={bucket.value}>
                      <button
                        type="button"
                        onClick={handleClick}
                        disabled={disabled}
                        className={clsx(
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
                          isActive
                            ? "border-midnight bg-midnight text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900",
                          disabled ? "cursor-not-allowed opacity-60" : undefined,
                        )}
                      >
                        <span className="truncate">{label}</span>
                        <span className="text-xs font-semibold">{countLabel}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
