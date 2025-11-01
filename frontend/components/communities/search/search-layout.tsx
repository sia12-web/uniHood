"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type {
  EventSearchSource,
  GroupSearchSource,
  PostSearchSource,
  SearchResultHit,
  TypeaheadResult,
  TypeaheadScope,
} from "@/lib/community-search";
import type { NormalizedSearchParams, SearchScope } from "@/utils/search";
import { buildUrlParams, normalizeSearchParams } from "@/utils/search";
import { useSearch, getTypeaheadScope, type CombinedSearchHit } from "@/hooks/communities/use-search";

import { FiltersBar, type CampusOption } from "./filters-bar";
import { SearchInput } from "./search-input";
import { RateLimitNotice } from "./rate-limit-notice";
import { FacetsPanel } from "./facets-panel";
import { ResultListVirtual } from "./result-list-virtual";
import { GroupResultCard } from "./group-result-card";
import { PostResultCard } from "./post-result-card";
import { EventResultCard } from "./event-result-card";

export type SearchLayoutProps = {
  initialScope: SearchScope;
  initialParams: NormalizedSearchParams;
  campuses: CampusOption[];
};

export function SearchLayout({ initialScope, initialParams, campuses }: SearchLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [typeaheadScope, setTypeaheadScope] = useState<TypeaheadScope>(() => getTypeaheadScope(initialScope));
  const [filters, setFilters] = useState<NormalizedSearchParams>(initialParams);
  const [draftQuery, setDraftQuery] = useState(initialParams.q);

  useEffect(() => {
    setScope(initialScope);
    setTypeaheadScope(getTypeaheadScope(initialScope));
    setFilters(initialParams);
    setDraftQuery(initialParams.q);
  }, [initialParams, initialScope]);

  const searchQuery = useSearch(scope, filters);

  const syncUrl = useCallback(
    (nextScope: SearchScope, nextParams: NormalizedSearchParams) => {
      const search = new URLSearchParams(buildUrlParams(nextParams));
      search.set("scope", nextScope);
      router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (updater: (current: NormalizedSearchParams) => NormalizedSearchParams, nextScope?: SearchScope) => {
      setFilters((current) => {
        const updated = updater(current);
        const resolvedScope = nextScope ?? scope;
        syncUrl(resolvedScope, updated);
        return updated;
      });
      if (nextScope && nextScope !== scope) {
        setScope(nextScope);
      }
    },
    [scope, syncUrl],
  );

  useEffect(() => {
    const trimmed = draftQuery.trim();
    if (trimmed === filters.q) {
      return;
    }
    updateFilters((current) => ({ ...current, q: trimmed }));
  }, [draftQuery, filters.q, updateFilters]);

  const handleScopeChange = useCallback(
    (next: TypeaheadScope) => {
      if (next === "all") {
        setTypeaheadScope("all");
        return;
      }
      const targetScope = next as SearchScope;
      setTypeaheadScope(next);
      if (targetScope !== scope) {
        updateFilters((current) => ({ ...current }), targetScope);
      }
    },
    [scope, updateFilters],
  );

  const handleQuerySubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setDraftQuery(trimmed);
    },
    [],
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: TypeaheadResult) => {
      const trimmed = suggestion.label.trim();
      setDraftQuery(trimmed);
      if (suggestion.scope !== "all") {
        const targetScope = suggestion.scope as SearchScope;
        setTypeaheadScope(suggestion.scope);
        updateFilters((current) => ({ ...current, q: trimmed }), targetScope);
        return;
      }
      updateFilters((current) => ({ ...current, q: trimmed }));
    },
    [updateFilters],
  );

  const handleCampusChange = useCallback(
    (next: string | null) => {
      updateFilters((current) => ({ ...current, campus_id: next ?? undefined }));
    },
    [updateFilters],
  );

  const handleTimeChange = useCallback(
    (range: { preset: string; from?: string | null; to?: string | null }) => {
      updateFilters((current) => ({ ...current, time_from: range.from ?? undefined, time_to: range.to ?? undefined }));
    },
    [updateFilters],
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateFilters((current) => ({ ...current, tags }));
    },
    [updateFilters],
  );

  const handleReset = useCallback(() => {
    const reset = normalizeSearchParams({});
    setDraftQuery(reset.q);
    updateFilters(() => reset);
  }, [updateFilters]);

  const renderHit = useCallback(
    (hit: CombinedSearchHit) => {
      if (scope === "groups") {
        return <GroupResultCard hit={hit as SearchResultHit<GroupSearchSource>} />;
      }
      if (scope === "posts") {
        return <PostResultCard hit={hit as SearchResultHit<PostSearchSource>} />;
      }
      return <EventResultCard hit={hit as SearchResultHit<EventSearchSource>} />;
    },
    [scope],
  );

  const stats = useMemo(() => {
    const took = searchQuery.took;
    const count = searchQuery.hits.length;
    if (!count && !took) {
      return null;
    }
    return `${count.toLocaleString()} result${count === 1 ? "" : "s"}${took ? ` • ${took}ms` : ""}`;
  }, [searchQuery.hits.length, searchQuery.took]);

  return (
    <div className="space-y-6">
      <SearchInput
        scope={scope}
        typeaheadScope={typeaheadScope}
        query={draftQuery}
        onQueryChange={setDraftQuery}
        onSubmit={handleQuerySubmit}
        onSuggestionSelect={handleSuggestionSelect}
        onScopeChange={handleScopeChange}
      />

      {searchQuery.isRateLimited ? <RateLimitNotice retryAfter={searchQuery.retryAfter} /> : null}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span className="font-semibold uppercase tracking-wide text-slate-400">{scope}</span>
            {stats ? <span>{stats}</span> : null}
          </div>
          <ResultListVirtual
            hits={searchQuery.hits}
            hasNextPage={Boolean(searchQuery.hasNextPage)}
            isLoading={searchQuery.isLoading}
            isFetchingNextPage={searchQuery.isFetchingNextPage}
            onLoadMore={() => {
              if (searchQuery.hasNextPage && !searchQuery.isFetchingNextPage) {
                void searchQuery.fetchNextPage();
              }
            }}
            emptyState={
              <div className="text-center text-sm text-slate-500">
                <p className="font-semibold">No matches yet.</p>
                <p>Try a different query or tweak your filters.</p>
              </div>
            }
            renderHit={renderHit}
          />
        </div>
        <div className="w-full space-y-4 lg:w-80">
          <FiltersBar
            scope={scope}
            params={filters}
            campuses={campuses}
            onCampusChange={handleCampusChange}
            onTimeChange={handleTimeChange}
            onTagsChange={handleTagsChange}
            onReset={handleReset}
          />
          <FacetsPanel
            scope={scope}
            facets={searchQuery.facets ?? undefined}
            selected={filters}
            onCampusSelect={handleCampusChange}
            onTagToggle={(tag) => {
              handleTagsChange(
                filters.tags.includes(tag)
                  ? filters.tags.filter((value) => value !== tag)
                  : [...filters.tags, tag],
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
