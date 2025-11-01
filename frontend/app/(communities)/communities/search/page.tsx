import { SearchLayout } from "@/components/communities/search/search-layout";
import { normalizeSearchParams, type SearchScope } from "@/utils/search";
import { listCampuses } from "@/lib/identity";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata = {
  title: "Community Search",
};

function resolveScope(value: unknown): SearchScope {
  if (value === "posts" || value === "events") {
    return value;
  }
  return "groups";
}

export default async function CommunitiesSearchPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  await requireCurrentUser();

  const scope = resolveScope(searchParams?.scope);

  const tagsParam = searchParams?.tags;
  const tags = Array.isArray(tagsParam) ? tagsParam : tagsParam ? [tagsParam] : [];

  const normalized = normalizeSearchParams({
    q: typeof searchParams?.q === "string" ? searchParams.q : "",
    campus_id: typeof searchParams?.campus === "string" ? searchParams.campus : null,
    tags,
    time_from: typeof searchParams?.time_from === "string" ? searchParams.time_from : null,
    time_to: typeof searchParams?.time_to === "string" ? searchParams.time_to : null,
    size:
      typeof searchParams?.size === "string"
        ? Number.parseInt(searchParams.size, 10)
        : typeof searchParams?.size === "number"
          ? searchParams.size
          : null,
  });

  const campuses = await listCampuses();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Search communities</h1>
        <p className="text-sm text-slate-600">
          Find groups, discover upcoming events, and surface posts across your campus network.
        </p>
      </header>
      <SearchLayout
        initialScope={scope}
        initialParams={normalized}
        campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
      />
    </div>
  );
}
