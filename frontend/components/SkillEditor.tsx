"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import type { ChangeEvent } from "react";

import type { MySkill, VisibilityScope } from "@/lib/types";

type SkillEditorProps = {
	skills: MySkill[];
	loading?: boolean;
	onUpsert: (params: {
		name: string;
		display: string;
		proficiency: number;
		visibility: VisibilityScope;
	}) => Promise<void>;
	onRemove: (name: string) => Promise<void>;
	onVisibilityChange: (name: string, visibility: VisibilityScope) => Promise<void>;
};

const VISIBILITY_OPTIONS: VisibilityScope[] = ["everyone", "friends", "none"];

function slugify(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9.+-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export default function SkillEditor({ skills, loading = false, onUpsert, onRemove, onVisibilityChange }: SkillEditorProps) {
	const [display, setDisplay] = useState("");
	const [name, setName] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [proficiency, setProficiency] = useState(3);
	const [visibility, setVisibility] = useState<VisibilityScope>("everyone");
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const isSubmitDisabled = useMemo(() => display.trim().length === 0 || name.trim().length === 0, [display, name]);

	const handleDisplayChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			setDisplay(event.target.value);
			if (!slugEdited) {
				setName(slugify(event.target.value));
			}
		},
		[slugEdited],
	);

	const handleSlugChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setSlugEdited(true);
		setName(slugify(event.target.value));
	}, []);

	const resetForm = useCallback(() => {
		setDisplay("");
		setName("");
		setSlugEdited(false);
		setProficiency(3);
		setVisibility("everyone");
	}, []);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (isSubmitDisabled) {
				return;
			}
			setPending(true);
			setFeedback(null);
			setError(null);
			try {
				await onUpsert({
					name: slugify(name),
					display: display.trim(),
					proficiency,
					visibility,
				});
				setFeedback("Skill saved.");
				resetForm();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to save skill");
			} finally {
				setPending(false);
			}
		},
		[display, name, proficiency, visibility, onUpsert, isSubmitDisabled, resetForm],
	);

	const handleRemove = useCallback(
		async (slug: string) => {
			setPending(true);
			setFeedback(null);
			setError(null);
			try {
				await onRemove(slug);
				setFeedback("Skill removed.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to remove skill");
			} finally {
				setPending(false);
			}
		},
		[onRemove],
	);

	const handleVisibility = useCallback(
		async (slug: string, next: VisibilityScope) => {
			setPending(true);
			setFeedback(null);
			setError(null);
			try {
				await onVisibilityChange(slug, next);
				setFeedback("Visibility updated.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to update visibility");
			} finally {
				setPending(false);
			}
		},
		[onVisibilityChange],
	);

	return (
		<section className="space-y-4">
			<form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-200 bg-white px-4 py-4">
				<h2 className="text-base font-semibold text-slate-900">Add a skill</h2>
				<p className="text-sm text-slate-600">
					Use skills to highlight tools or domains you feel confident about. Each skill includes a short display label
					and a proficiency score from 1 (learning) to 5 (expert).
				</p>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Display label</span>
						<input
							type="text"
							value={display}
							onChange={handleDisplayChange}
							maxLength={40}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Slug</span>
						<input
							type="text"
							value={name}
							onChange={handleSlugChange}
							maxLength={30}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
						<span className="text-xs text-slate-500">Lowercase letters, digits, dot, plus and hyphen only.</span>
					</label>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Proficiency</span>
						<input
							type="number"
							min={1}
							max={5}
							value={proficiency}
							onChange={(event) => setProficiency(Number(event.target.value))}
							className="w-24 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Visibility</span>
						<select
							value={visibility}
							onChange={(event) => setVisibility(event.target.value as VisibilityScope)}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						>
							<option value="everyone">Everyone</option>
							<option value="friends">Friends</option>
							<option value="none">Hidden</option>
						</select>
					</label>
				</div>
				<button
					type="submit"
					disabled={pending || isSubmitDisabled}
					className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
				>
					{pending ? "Saving…" : "Save skill"}
				</button>
			</form>
			{feedback ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
			) : null}
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			<section className="space-y-2">
				<h3 className="text-base font-semibold text-slate-900">Your skills</h3>
				{loading && skills.length === 0 ? <p className="text-sm text-slate-500">Loading skills…</p> : null}
				{!loading && skills.length === 0 ? <p className="text-sm text-slate-500">No skills yet. Add your first one above.</p> : null}
				{skills.length > 0 ? (
					<table className="w-full table-fixed border-collapse text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wide text-slate-500">
								<th className="w-1/3 pb-2">Display</th>
								<th className="w-1/4 pb-2">Slug</th>
								<th className="w-20 pb-2">Proficiency</th>
								<th className="w-32 pb-2">Visibility</th>
								<th className="w-16 pb-2" aria-label="actions" />
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200">
							{skills.map((skill) => (
								<tr key={skill.name}>
									<td className="py-2 font-medium text-slate-900">{skill.display}</td>
									<td className="py-2 text-slate-500">{skill.name}</td>
									<td className="py-2">{skill.proficiency}</td>
									<td className="py-2">
										<select
											aria-label="Skill visibility"
											value={skill.visibility}
											onChange={(event) =>
												handleVisibility(skill.name, event.target.value as VisibilityScope)
											}
											disabled={pending}
											className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
										>
											{VISIBILITY_OPTIONS.map((option) => (
												<option key={option} value={option}>
													{option === "everyone" ? "Everyone" : option === "friends" ? "Friends" : "Hidden"}
												</option>
											))}
										</select>
									</td>
									<td className="py-2 text-right">
										<button
											type="button"
											onClick={() => handleRemove(skill.name)}
											disabled={pending}
											className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
										>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : null}
			</section>
		</section>
	);
}
