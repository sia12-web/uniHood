"use client";

import { useEffect, useMemo, useState } from "react";

import type { MacroSelector } from "@/hooks/mod/tools/use-macro";

export type SelectorBuilderValue = MacroSelector;

export type SelectorBuilderProps = {
	value: SelectorBuilderValue;
	onChange(value: SelectorBuilderValue): void;
	disabled?: boolean;
	allowUserSubjects?: boolean;
};

function parseIds(input: string): string[] {
	return input
		.split(/[,\s]+/)
		.map((value) => value.trim())
		.filter(Boolean);
}

function normalizeSubjectType(value: unknown): "post" | "comment" | "user" {
	return value === "comment" || value === "user" ? value : "post";
}

export function SelectorBuilder({ value, onChange, disabled, allowUserSubjects = true }: SelectorBuilderProps) {
	const [kind, setKind] = useState<SelectorBuilderValue["kind"]>(value.kind);
	const [idsInput, setIdsInput] = useState<string>(value.kind === "cases" || value.kind === "subjects" ? value.ids.join("\n") : "");
	const [subjectType, setSubjectType] = useState<"post" | "comment" | "user">(
		value.kind === "subjects" || value.kind === "query" ? normalizeSubjectType(value.subject_type) : "post",
	);
	const [queryFilter, setQueryFilter] = useState<Record<string, unknown>>(
		value.kind === "query"
			? value.filter
			: {
				campus: "",
				actor_id: "",
				shadow_only: true,
				start: "",
				end: "",
			},
	);

	useEffect(() => {
		setKind(value.kind);
		if (value.kind === "cases" || value.kind === "subjects") {
			setIdsInput(value.ids.join("\n"));
		}
		if (value.kind === "subjects") {
			setSubjectType(normalizeSubjectType(value.subject_type));
		}
		if (value.kind === "query") {
			setSubjectType(normalizeSubjectType(value.subject_type));
			setQueryFilter(value.filter);
		}
	}, [value]);

	useEffect(() => {
		if (kind === "cases") {
			onChange({ kind: "cases", ids: parseIds(idsInput) });
		} else if (kind === "subjects") {
			onChange({ kind: "subjects", subject_type: subjectType, ids: parseIds(idsInput) });
		} else {
			onChange({
				kind: "query",
				subject_type: subjectType,
				filter: {
					...queryFilter,
					campus: (queryFilter.campus as string) || undefined,
					actor_id: (queryFilter.actor_id as string) || undefined,
					shadow_only: queryFilter.shadow_only !== false,
					created_after: (queryFilter.start as string) || undefined,
					created_before: (queryFilter.end as string) || undefined,
				},
			});
		}
	}, [kind, idsInput, subjectType, queryFilter, onChange]);

	const idPlaceholder = useMemo(() => (kind === "cases" ? "case-123" : "subject-456"), [kind]);

	return (
		<section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<header className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Selector</h3>
				<p className="text-sm text-slate-600">Choose which cases or subjects the tool will run against.</p>
			</header>
			<div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
				<label className="flex items-center gap-2">
					<input
						type="radio"
						name="selector-kind"
						value="cases"
						checked={kind === "cases"}
						onChange={() => setKind("cases")}
						disabled={disabled}
					/>
					Cases
				</label>
				<label className="flex items-center gap-2">
					<input
						type="radio"
						name="selector-kind"
						value="subjects"
						checked={kind === "subjects"}
						onChange={() => setKind("subjects")}
						disabled={disabled}
					/>
					Subjects
				</label>
				<label className="flex items-center gap-2">
					<input
						type="radio"
						name="selector-kind"
						value="query"
						checked={kind === "query"}
						onChange={() => setKind("query")}
						disabled={disabled}
					/>
					Query
				</label>
			</div>

			{kind === "subjects" ? (
				<label className="flex max-w-xs items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Subject type
					<select
						className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
						value={subjectType}
						onChange={(event) => setSubjectType(normalizeSubjectType(event.target.value))}
						disabled={disabled}
					>
						<option value="post">Post</option>
						<option value="comment">Comment</option>
						{allowUserSubjects ? <option value="user">User</option> : null}
					</select>
				</label>
			) : null}

			{kind === "query" ? (
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Subject type</span>
						<select
							value={subjectType}
							onChange={(event) => setSubjectType(normalizeSubjectType(event.target.value))}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
							disabled={disabled}
						>
							<option value="post">Post</option>
							<option value="comment">Comment</option>
							{allowUserSubjects ? <option value="user">User</option> : null}
						</select>
					</label>
					<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Campus</span>
						<input
							type="text"
							value={(queryFilter.campus as string) ?? ""}
							onChange={(event) => setQueryFilter((prev) => ({ ...prev, campus: event.target.value }))}
							className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
							disabled={disabled}
							placeholder="north-campus"
						/>
					</label>
					<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Actor ID</span>
						<input
							type="text"
							value={(queryFilter.actor_id as string) ?? ""}
							onChange={(event) => setQueryFilter((prev) => ({ ...prev, actor_id: event.target.value }))}
							className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
							disabled={disabled}
							placeholder="moderator-123"
						/>
					</label>
					<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Date range</span>
						<div className="grid grid-cols-2 gap-2">
							<input
								type="datetime-local"
								value={(queryFilter.start as string) ?? ""}
								onChange={(event) => setQueryFilter((prev) => ({ ...prev, start: event.target.value }))}
								className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
								disabled={disabled}
							/>
							<input
								type="datetime-local"
								value={(queryFilter.end as string) ?? ""}
								onChange={(event) => setQueryFilter((prev) => ({ ...prev, end: event.target.value }))}
								className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
								disabled={disabled}
							/>
						</div>
					</label>
					<label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<input
							type="checkbox"
							checked={queryFilter.shadow_only !== false}
							onChange={(event) => setQueryFilter((prev) => ({ ...prev, shadow_only: event.target.checked }))}
							disabled={disabled}
						/>
						Shadow-only results
					</label>
				</div>
			) : (
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>{kind === "cases" ? "Case IDs" : "Subject IDs"}</span>
					<textarea
						value={idsInput}
						onChange={(event) => setIdsInput(event.target.value)}
						className="h-32 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
						disabled={disabled}
						placeholder={`${idPlaceholder} (comma or newline separated)`}
					/>
					<p className="text-xs text-slate-500">Separate values by comma or newline. Minimum one required.</p>
				</label>
			)}
		</section>
	);
}
