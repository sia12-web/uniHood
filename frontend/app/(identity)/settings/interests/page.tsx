"use client";

import { useCallback, useEffect, useState } from "react";

import InterestPicker from "@/components/InterestPicker";
import {
	addInterest,
	fetchMyInterests,
	removeInterest,
	suggestInterests,
	updateInterestVisibility,
} from "@/lib/profiles";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { InterestNode, MyInterest, VisibilityScope } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function InterestSettingsPage() {
	const [interests, setInterests] = useState<MyInterest[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const records = await fetchMyInterests(DEMO_USER_ID, DEMO_CAMPUS_ID);
				if (!cancelled) {
					setInterests(records);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load interests");
					setInterests([]);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);


	const handleSuggest = (query: string): Promise<InterestNode[]> => {
		if (query.trim().length < 2) {
			return Promise.resolve([]);
		}
		return suggestInterests(query, { campusId: DEMO_CAMPUS_ID, limit: 8 });
	};

	const handleAddNode = useCallback(
		async (node: InterestNode, visibility: VisibilityScope) => {
			const records = await addInterest(DEMO_USER_ID, DEMO_CAMPUS_ID, node.id, visibility);
			setInterests(records);
		},
		[],
	);

	const handleRemove = useCallback(
		async (interestId: string) => {
			const records = await removeInterest(DEMO_USER_ID, DEMO_CAMPUS_ID, interestId);
			setInterests(records);
		},
		[],
	);

	const handleVisibilityChange = useCallback(
		async (interestId: string, visibility: VisibilityScope) => {
			const records = await updateInterestVisibility(DEMO_USER_ID, DEMO_CAMPUS_ID, interestId, visibility);
			setInterests(records);
		},
		[],
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Interests</h1>
				<p className="text-sm text-slate-600">
					Pick interests to power matching and your public profile. Visibility controls who sees each item.
				</p>
			</header>
			{error ? (
				<div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
			) : null}
			<InterestPicker
				interests={interests}
				loading={loading}
				onAdd={handleAddNode}
				onRemove={handleRemove}
				onVisibilityChange={handleVisibilityChange}
				onSuggest={handleSuggest}
			/>
		</main>
	);
}
