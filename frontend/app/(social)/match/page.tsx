"use client";

import { useCallback, useState } from "react";

import MatchFiltersForm from "@/components/MatchFiltersForm";
import MatchingResults from "@/components/MatchingResults";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { matchPeople } from "@/lib/profiles";
import type { MatchPerson } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function MatchPage() {
	const [matches, setMatches] = useState<MatchPerson[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSearch = useCallback(
		async (filters: { interests: string[]; skills: string[] }) => {
			setLoading(true);
			setError(null);
			try {
				const results = await matchPeople({
					userId: DEMO_USER_ID,
					campusId: DEMO_CAMPUS_ID,
					interests: filters.interests,
					skills: filters.skills,
					limit: 25,
				});
				setMatches(results);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unable to find matches right now");
				setMatches([]);
			} finally {
				setLoading(false);
			}
		},
		[],
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Find collaborators</h1>
				<p className="text-sm text-slate-600">
					Share interests or skill keywords to discover people nearby who might be a good fit for your next project.
				</p>
			</header>
			<MatchFiltersForm onSearch={handleSearch} loading={loading} />
			{error ? (
				<div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
			) : null}
			<MatchingResults matches={matches} loading={loading} />
		</main>
	);
}
