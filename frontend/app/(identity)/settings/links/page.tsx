"use client";

import { useCallback, useEffect, useState } from "react";

import LinkEditor from "@/components/LinkEditor";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchMyLinks, removeLink, upsertLink, updateLinkVisibility } from "@/lib/profiles";
import type { MyLink, VisibilityScope } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function LinkSettingsPage() {
	const [links, setLinks] = useState<MyLink[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const records = await fetchMyLinks(DEMO_USER_ID, DEMO_CAMPUS_ID);
				if (!cancelled) {
					setLinks(records);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load links");
					setLinks([]);
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

	const handleUpsert = useCallback(
		async (payload: { kind: string; url: string; visibility: VisibilityScope }) => {
			const updated = await upsertLink(DEMO_USER_ID, DEMO_CAMPUS_ID, payload);
			setLinks(updated);
		},
		[],
	);

	const handleRemove = useCallback(
		async (kind: string) => {
			const updated = await removeLink(DEMO_USER_ID, DEMO_CAMPUS_ID, kind);
			setLinks(updated);
		},
		[],
	);

	const handleVisibility = useCallback(
		async (kind: string, visibility: VisibilityScope) => {
			const updated = await updateLinkVisibility(DEMO_USER_ID, DEMO_CAMPUS_ID, kind, visibility);
			setLinks(updated);
		},
		[],
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Links</h1>
				<p className="text-sm text-slate-600">Add portfolio and social links so classmates can explore your work.</p>
			</header>
			{error ? (
				<div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
			) : null}
			<LinkEditor
				links={links}
				loading={loading}
				onUpsert={handleUpsert}
				onRemove={handleRemove}
				onVisibilityChange={handleVisibility}
			/>
		</main>
	);
}
