"use client";

import { useMemo } from "react";

import { MetaPretty } from "./meta-pretty";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonPatchOperation = {
	op: "add" | "remove" | "replace" | "copy" | "move" | "test" | string;
	path: string;
	value?: JsonValue;
	from?: string;
};

export type DiffViewProps = {
	before?: Record<string, unknown> | null;
	after?: Record<string, unknown> | null;
	diff?: JsonPatchOperation[] | null;
	isAdmin: boolean;
	allowlist?: string[];
};

type ObjectDiffRow = {
	key: string;
	status: "added" | "removed" | "changed" | "unchanged";
	before?: string | null;
	after?: string | null;
};

function formatValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value, null, 2) ?? "";
}

function computeObjectDiff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): ObjectDiffRow[] {
	const keys = new Set<string>();
	Object.keys(before ?? {}).forEach((key) => keys.add(key));
	Object.keys(after ?? {}).forEach((key) => keys.add(key));
	return Array.from(keys)
		.sort()
		.map((key) => {
			const prev = before?.[key];
			const next = after?.[key];
			if (prev === undefined) {
				return { key, status: "added", before: null, after: formatValue(next) };
			}
			if (next === undefined) {
				return { key, status: "removed", before: formatValue(prev), after: null };
			}
			if (JSON.stringify(prev) === JSON.stringify(next)) {
				return { key, status: "unchanged", before: formatValue(prev), after: formatValue(next) };
			}
			return { key, status: "changed", before: formatValue(prev), after: formatValue(next) };
		});
}

function renderStatusBadge(status: ObjectDiffRow["status"]): string {
	switch (status) {
		case "added":
			return "Added";
		case "removed":
			return "Removed";
		case "changed":
			return "Changed";
		default:
			return "Unchanged";
	}
}

function statusClass(status: ObjectDiffRow["status"]): string {
	switch (status) {
		case "added":
			return "bg-emerald-100 text-emerald-700 border-emerald-200";
		case "removed":
			return "bg-rose-100 text-rose-700 border-rose-200";
		case "changed":
			return "bg-amber-100 text-amber-700 border-amber-200";
		default:
			return "bg-slate-100 text-slate-600 border-slate-200";
	}
}

export function DiffView({ before, after, diff, isAdmin, allowlist }: DiffViewProps) {
	const objectRows = useMemo(() => computeObjectDiff(before, after), [before, after]);
	const hasObjectDiff = useMemo(
		() => objectRows.some((row) => row.status !== "unchanged"),
		[objectRows],
	);

	return (
		<div className="space-y-4">
			{hasObjectDiff ? (
				<div className="overflow-hidden rounded-xl border border-slate-200">
					<table className="min-w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50">
							<tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th className="px-4 py-2">Field</th>
								<th className="px-4 py-2">Before</th>
								<th className="px-4 py-2">After</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200">
							{objectRows.map((row) => (
								<tr key={row.key} className="align-top">
									<td className="w-48 px-4 py-3 text-xs font-semibold text-slate-600">
										<div className="flex items-center gap-2">
											<span>{row.key}</span>
											<span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${statusClass(row.status)}`}>
												{renderStatusBadge(row.status)}
											</span>
										</div>
									</td>
									<td className="whitespace-pre-wrap px-4 py-3 text-xs text-slate-700">{row.before ?? "—"}</td>
									<td className="whitespace-pre-wrap px-4 py-3 text-xs text-slate-700">{row.after ?? "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="text-sm text-slate-500">No field-level changes detected.</p>
			)}

			{diff?.length ? (
				<div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
					<header className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-slate-700">JSON Patch</h3>
						<span className="text-xs text-slate-500">{diff.length} operations</span>
					</header>
					<ol className="space-y-2 text-xs">
						{diff.map((operation, index) => (
							<li key={`${operation.op}-${operation.path}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
								<div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-wide text-slate-600">
									<span>{operation.op}</span>
									<span className="font-mono text-slate-500">{operation.path}</span>
								</div>
								{operation.value !== undefined ? (
									<pre className="mt-2 whitespace-pre-wrap text-[0.7rem] text-slate-700">{formatValue(operation.value)}</pre>
								) : null}
							</li>
						))}
					</ol>
				</div>
			) : null}

			{!hasObjectDiff && !diff?.length && before ? (
				<MetaPretty meta={before} isAdmin={isAdmin} allowlist={allowlist} collapsedLines={10} />
			) : null}
		</div>
	);
}
