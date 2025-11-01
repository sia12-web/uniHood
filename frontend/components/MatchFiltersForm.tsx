"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";

type MatchFiltersFormProps = {
	onSearch: (filters: { interests: string[]; skills: string[] }) => Promise<void> | void;
	loading?: boolean;
	defaultInterests?: string[];
	defaultSkills?: string[];
};

function parseList(input: string): string[] {
	return input
		.split(",")
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

export default function MatchFiltersForm({
	onSearch,
	loading = false,
	defaultInterests = [],
	defaultSkills = [],
}: MatchFiltersFormProps) {
	const [interestInput, setInterestInput] = useState(defaultInterests.join(", "));
	const [skillInput, setSkillInput] = useState(defaultSkills.join(", "));
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isSubmitDisabled = useMemo(
		() => parseList(interestInput).length === 0 && parseList(skillInput).length === 0,
		[interestInput, skillInput],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (isSubmitDisabled) {
				setError("Add at least one interest or skill to search.");
				return;
			}
			setPending(true);
			setError(null);
			try {
				await onSearch({
					interests: parseList(interestInput),
					skills: parseList(skillInput),
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to search for matches");
			} finally {
				setPending(false);
			}
		},
		[interestInput, skillInput, isSubmitDisabled, onSearch],
	);

	const reset = useCallback(() => {
		setInterestInput("");
		setSkillInput("");
	}, []);

	return (
		<form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-200 bg-white px-4 py-4">
			<h2 className="text-base font-semibold text-slate-900">Find collaborators</h2>
			<p className="text-sm text-slate-600">
				Provide interest names or skill slugs to discover nearby people with similar goals. Separate terms using commas.
			</p>
			<label className="flex flex-col gap-1 text-sm text-slate-700">
				<span className="font-medium">Interests</span>
				<input
					type="text"
					value={interestInput}
					onChange={(event) => setInterestInput(event.target.value)}
					placeholder="robotics, volleyball"
					className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm text-slate-700">
				<span className="font-medium">Skills</span>
				<input
					type="text"
					value={skillInput}
					onChange={(event) => setSkillInput(event.target.value)}
					placeholder="python, figma"
					className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
				/>
			</label>
			{error ? <p className="text-sm text-rose-600">{error}</p> : null}
			<div className="flex items-center gap-3">
				<button
					type="submit"
					disabled={pending || loading}
					className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
				>
					{pending || loading ? "Searching…" : "Search"}
				</button>
				<button
					type="button"
					onClick={reset}
					disabled={pending}
					className="text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
				>
					Clear
				</button>
			</div>
		</form>
	);
}
