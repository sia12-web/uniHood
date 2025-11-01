"use client";

import Link from "next/link";

import type { ModerationCase } from "@/hooks/mod/use-cases";

export type CaseRowProps = {
	caseItem: ModerationCase;
	selected: boolean;
	onToggle: (id: string) => void;
};

function formatDate(value: string): string {
	return new Date(value).toLocaleString();
}

export function CaseRow({ caseItem, selected, onToggle }: CaseRowProps) {
	return (
		<tr className={selected ? "bg-slate-100" : "bg-white"}>
			<td className="px-3 py-2">
				<input
					type="checkbox"
					checked={selected}
					onChange={() => onToggle(caseItem.id)}
					aria-label={`Select case ${caseItem.id}`}
					className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
				/>
			</td>
			<td className="px-3 py-2 text-sm font-mono text-slate-700">
				<Link href={`/admin/mod/cases/${caseItem.id}`} className="underline-offset-2 hover:underline">
					{caseItem.id}
				</Link>
			</td>
			<td className="px-3 py-2 text-sm text-slate-700">
				<span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">{caseItem.severity}</span>
			</td>
			<td className="px-3 py-2 text-sm text-slate-600 capitalize">{caseItem.status}</td>
			<td className="px-3 py-2 text-sm text-slate-600">
				{caseItem.subject_type} · {caseItem.subject_id}
			</td>
			<td className="px-3 py-2 text-sm text-slate-600">{caseItem.reason}</td>
			<td className="px-3 py-2 text-sm text-slate-600">{caseItem.assigned_to ?? "—"}</td>
			<td className="px-3 py-2 text-xs text-slate-500">{formatDate(caseItem.updated_at)}</td>
		</tr>
	);
}
