"use client";
import Link from "next/link";

import type { MatchPerson } from "@/lib/types";

type MatchingResultsProps = {
	matches: MatchPerson[];
	loading?: boolean;
	emptyMessage?: string;
};

export default function MatchingResults({ matches, loading = false, emptyMessage }: MatchingResultsProps) {
	if (loading) {
		return <p className="text-sm text-slate-500">Searching for matches…</p>;
	}

	if (matches.length === 0) {
		return <p className="text-sm text-slate-500">{emptyMessage ?? "No matches yet. Try adjusting your filters."}</p>;
	}

	return (
		<ul className="space-y-3">
			{matches.map((match) => (
				<li key={match.user_id} className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3">
					{match.avatar_url ? (
						/* eslint-disable-next-line @next/next/no-img-element */
						<img
							src={match.avatar_url}
							alt={`${match.display_name}'s avatar`}
							className="h-12 w-12 rounded-full object-cover"
						/>
					) : (
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
							{match.display_name.slice(0, 1).toUpperCase()}
						</div>
					)}
					<div className="flex-1">
						<p className="text-sm font-semibold text-slate-900">{match.display_name}</p>
						<p className="text-xs text-slate-500">@{match.handle}</p>
						{match.interests.length > 0 ? (
							<p className="mt-1 text-xs text-slate-500">Interests: {match.interests.slice(0, 3).join(", ")}</p>
						) : null}
						{match.skills.length > 0 ? (
							<p className="mt-1 text-xs text-slate-500">
								Skills: {match.skills.slice(0, 3).map((skill) => skill.display).join(", ")}
							</p>
						) : null}
					</div>
					<div className="text-right">
						<p className="text-xs font-medium text-slate-600">Score {match.score.toFixed(1)}</p>
						<Link href={`/profiles/${match.handle}`} className="text-xs font-medium text-slate-600 underline">
							View profile
						</Link>
					</div>
				</li>
			))}
		</ul>
	);
}
