"use client";

import Link from "next/link";

import type { AuditEvent } from "@/hooks/mod/audit/use-audit-list";

import { DiffView, type JsonPatchOperation } from "./diff-view";
import { MetaPretty } from "./meta-pretty";

export type AuditRowProps = {
	event: AuditEvent;
	expanded: boolean;
	onToggle: (id: string) => void;
	isAdmin: boolean;
};

function formatDate(value: string): string {
	try {
		return new Date(value).toLocaleString();
	} catch {
		return value;
	}
}

export function AuditRow({ event, expanded, onToggle, isAdmin }: AuditRowProps) {
	const diffCandidate = event.meta ?? {};
	const before = (diffCandidate.before as Record<string, unknown> | undefined) ?? undefined;
	const after = (diffCandidate.after as Record<string, unknown> | undefined) ?? undefined;
	const diff = diffCandidate.diff as unknown;
	const caseId = event.target_type === "case" ? event.target_id : (event.meta?.case_id as string | undefined);

	return (
		<article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
			<button
				type="button"
				onClick={() => onToggle(event.id)}
				className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
				aria-expanded={expanded ? "true" : "false"}
			>
				<div className="flex flex-1 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
						<span className="font-mono text-xs text-slate-500">{event.id}</span>
						<span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">{event.action}</span>
						<span className="text-xs text-slate-500">{formatDate(event.created_at)}</span>
					</div>
					<div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
						<span className="font-semibold text-slate-800">Actor:</span>
						<span>{event.actor_id ?? "System"}</span>
						<span className="text-slate-400">•</span>
						<span className="font-semibold text-slate-800">Target:</span>
						<span>
							{event.target_type}
							{event.target_id ? ` · ${event.target_id}` : ""}
						</span>
						{caseId ? (
							<Link href={`/admin/mod/cases/${caseId}/timeline`} className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline">
								View case timeline
							</Link>
						) : null}
					</div>
				</div>
				<span className="text-xs uppercase tracking-wide text-slate-500">{expanded ? "Collapse" : "Expand"}</span>
			</button>
			{expanded ? (
				<div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
					<DiffView
						before={before ?? null}
						after={after ?? null}
						diff={Array.isArray(diff) ? (diff as JsonPatchOperation[]) : null}
						isAdmin={isAdmin}
					/>
					<div className="mt-4">
						<MetaPretty meta={event.meta} isAdmin={isAdmin} collapsedLines={10} />
					</div>
				</div>
			) : null}
		</article>
	);
}
