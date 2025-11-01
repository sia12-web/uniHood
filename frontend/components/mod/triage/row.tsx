"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback } from "react";

import type { CaseSummary } from "@/hooks/mod/triage/use-queue";
import type { SlaState } from "@/hooks/mod/triage/use-sla";

import { SlaBadge } from "./sla-badge";

export type QueueRowProps = {
	caseItem: CaseSummary;
	selected: boolean;
	active?: boolean;
	onToggle: (caseId: string) => void;
	onOpen: (caseItem: CaseSummary) => void;
	buildSlaState?: (caseItem: CaseSummary) => () => SlaState;
};

function formatRelative(value: string | null | undefined): string {
	if (!value) return "--";
	try {
		return new Date(value).toLocaleString();
	} catch {
		return value;
	}
}

export function QueueRow({ caseItem, selected, active, onToggle, onOpen, buildSlaState }: QueueRowProps) {
	const handleOpen = useCallback(() => onOpen(caseItem), [caseItem, onOpen]);
	const toggle = useCallback(() => onToggle(caseItem.id), [caseItem.id, onToggle]);

	return (
		<tr
			role="row"
			tabIndex={0}
			aria-selected={active || selected ? "true" : "false"}
			onClick={handleOpen}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					handleOpen();
				}
			}}
			className={clsx(
				"cursor-pointer transition",
				active ? "bg-slate-100" : "bg-white",
				selected ? "ring-2 ring-slate-300" : "",
			)}
		>
			<td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
				<input
					type="checkbox"
					checked={selected}
					onChange={toggle}
					aria-label={`Select case ${caseItem.id}`}
					className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
				/>
			</td>
			<td className="px-3 py-3 text-sm font-mono text-slate-700">
				<Link href={`/admin/mod/cases/${caseItem.id}`} onClick={(event) => event.stopPropagation()} className="underline-offset-2 hover:underline">
					{caseItem.id}
				</Link>
				{caseItem.locked_by ? (
					<p className="mt-1 text-xs text-amber-600">Locked by {caseItem.locked_by}</p>
				) : null}
			</td>
			<td className="px-3 py-3 text-sm text-slate-700">
				<span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">sev {caseItem.severity}</span>
				{typeof caseItem.escalation_level === "number" && caseItem.escalation_level > 0 ? (
					<span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">Escalated</span>
				) : null}
			</td>
			<td className="px-3 py-3 text-sm text-slate-600">{caseItem.status}</td>
			<td className="px-3 py-3 text-sm text-slate-600">
				<div className="flex flex-col">
					<span className="font-semibold text-slate-700">{caseItem.subject}</span>
					{caseItem.reason ? <span className="text-xs text-slate-500">{caseItem.reason}</span> : null}
				</div>
			</td>
			<td className="px-3 py-3 text-sm text-slate-600">
				{caseItem.assigned_to_name ?? caseItem.assigned_to ?? "Unassigned"}
				{caseItem.appeal_status ? <p className="text-xs text-amber-600">Appeal: {caseItem.appeal_status}</p> : null}
			</td>
			<td className="px-3 py-3 text-sm text-slate-600">
				{buildSlaState ? <SlaBadge compute={buildSlaState(caseItem)} /> : <span className="text-xs uppercase text-slate-400">No SLA</span>}
			</td>
			<td className="px-3 py-3 text-xs text-slate-500">{formatRelative(caseItem.updated_at ?? caseItem.created_at)}</td>
		</tr>
	);
}
