"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { EducationRecord, VisibilityScope } from "@/lib/types";

type EducationTimelineProps = {
	record?: EducationRecord | null;
	loading?: boolean;
	onSave: (payload: { program: string; year: number | null; visibility: VisibilityScope }) => Promise<void>;
};

const VISIBILITY_OPTIONS: VisibilityScope[] = ["everyone", "friends", "none"];

export default function EducationTimeline({ record, loading = false, onSave }: EducationTimelineProps) {
	const [program, setProgram] = useState(record?.program ?? "");
	const [year, setYear] = useState<number | "" | null>(record?.year ?? null);
	const [visibility, setVisibility] = useState<VisibilityScope>(record?.visibility ?? "friends");
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const isSubmitDisabled = useMemo(() => program.trim().length === 0, [program]);

	const reset = useCallback(() => {
		setProgram(record?.program ?? "");
		setYear(record?.year ?? null);
		setVisibility(record?.visibility ?? "friends");
	}, [record]);

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
				const normalizedYear: number | null =
					year === ""
						? null
						: typeof year === "number"
							? Number.isFinite(year)
								? year
								: null
							: year;
				await onSave({
					program: program.trim(),
					year: normalizedYear,
					visibility,
				});
				setFeedback("Education updated.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to update education");
			} finally {
				setPending(false);
			}
		},
		[isSubmitDisabled, onSave, program, visibility, year],
	);

	useEffect(() => {
		setProgram(record?.program ?? "");
		setYear(record?.year ?? null);
		setVisibility(record?.visibility ?? "friends");
	}, [record?.program, record?.visibility, record?.year]);

	return (
		<section className="space-y-4">
			<form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-200 bg-white px-4 py-4">
				<h2 className="text-base font-semibold text-slate-900">Education</h2>
				<p className="text-sm text-slate-600">
					Share what you are studying so classmates can find you. Include your program name and optional graduation year.
				</p>
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Program</span>
					<input
						type="text"
						value={program}
						onChange={(event) => setProgram(event.target.value)}
						maxLength={80}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
				</label>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Graduation year</span>
						<input
							type="number"
							value={year ?? ""}
							onChange={(event) => {
								const value = event.target.value;
								setYear(value === "" ? "" : Number(value));
							}}
							placeholder="2026"
							className="w-32 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Visibility</span>
						<select
							aria-label="Education visibility"
							value={visibility}
							onChange={(event) => setVisibility(event.target.value as VisibilityScope)}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						>
							{VISIBILITY_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option === "everyone" ? "Everyone" : option === "friends" ? "Friends" : "Hidden"}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="flex items-center gap-3">
					<button
						type="submit"
						disabled={pending || isSubmitDisabled}
						className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
					>
						{pending ? "Saving…" : "Save education"}
					</button>
					<button
						type="button"
						onClick={reset}
						disabled={pending}
						className="text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
					>
						Reset
					</button>
				</div>
			</form>
			{feedback ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
			) : null}
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			<section className="rounded border border-slate-200 bg-white px-4 py-4">
				<h3 className="text-base font-semibold text-slate-900">Preview</h3>
				{loading ? (
					<p className="text-sm text-slate-500">Loading education…</p>
				) : (
					<div className="mt-3 space-y-2 text-sm text-slate-600">
						<p className="font-medium text-slate-900">{program || "Program not set"}</p>
						<p>{year === null || year === "" ? "Year hidden" : year}</p>
						<p className="text-xs text-slate-500">Visibility: {visibility.replace(/^./, (c) => c.toUpperCase())}</p>
						{record?.updated_at ? (
							<p className="text-xs text-slate-400">Updated {new Date(record.updated_at).toLocaleString()}</p>
						) : null}
					</div>
				)}
			</section>
		</section>
	);
}
