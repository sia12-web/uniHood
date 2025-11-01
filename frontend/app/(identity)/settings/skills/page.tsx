"use client";

import { useCallback, useEffect, useState } from "react";

import SkillEditor from "@/components/SkillEditor";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchMySkills, removeSkill, upsertSkill, updateSkillVisibility } from "@/lib/profiles";
import type { MySkill, VisibilityScope } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function SkillSettingsPage() {
	const [skills, setSkills] = useState<MySkill[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const records = await fetchMySkills(DEMO_USER_ID, DEMO_CAMPUS_ID);
				if (!cancelled) {
					setSkills(records);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load skills");
					setSkills([]);
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
		async (payload: { name: string; display: string; proficiency: number; visibility: VisibilityScope }) => {
			const updated = await upsertSkill(DEMO_USER_ID, DEMO_CAMPUS_ID, payload);
			setSkills(updated);
		},
		[],
	);

	const handleRemove = useCallback(
		async (name: string) => {
			const updated = await removeSkill(DEMO_USER_ID, DEMO_CAMPUS_ID, name);
			setSkills(updated);
		},
		[],
	);

	const handleVisibility = useCallback(
		async (name: string, visibility: VisibilityScope) => {
			const updated = await updateSkillVisibility(DEMO_USER_ID, DEMO_CAMPUS_ID, name, visibility);
			setSkills(updated);
		},
		[],
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Skills</h1>
				<p className="text-sm text-slate-600">
					Document your strongest skills to improve matching quality and your public profile.
				</p>
			</header>
			{error ? (
				<div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
			) : null}
			<SkillEditor
				skills={skills}
				loading={loading}
				onUpsert={handleUpsert}
				onRemove={handleRemove}
				onVisibilityChange={handleVisibility}
			/>
		</main>
	);
}
