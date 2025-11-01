"use client";

import { useCallback, useEffect, useState } from "react";

import EducationTimeline from "@/components/EducationTimeline";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchEducation, patchEducation } from "@/lib/profiles";
import type { EducationRecord, VisibilityScope } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function EducationSettingsPage() {
	const [education, setEducation] = useState<EducationRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const record = await fetchEducation(DEMO_USER_ID, DEMO_CAMPUS_ID);
				if (!cancelled) {
					setEducation(record);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setEducation(null);
					setError(err instanceof Error ? err.message : "Failed to load education");
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

	const handleSave = useCallback(
		async (payload: { program: string; year: number | null; visibility: VisibilityScope }) => {
			const updated = await patchEducation(DEMO_USER_ID, DEMO_CAMPUS_ID, payload);
			setEducation(updated);
		},
		[],
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Education</h1>
				<p className="text-sm text-slate-600">
					Keep your program and graduation year current so teammates and mentors understand your background.
				</p>
			</header>
			{error ? (
				<div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
			) : null}
			<EducationTimeline record={education} loading={loading} onSave={handleSave} />
		</main>
	);
}
