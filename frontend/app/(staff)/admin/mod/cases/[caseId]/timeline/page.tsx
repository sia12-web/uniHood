"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { DiffView } from "@/components/mod/audit/diff-view";
import { MetaPretty } from "@/components/mod/audit/meta-pretty";
import { useAuditList, flattenAuditPages } from "@/hooks/mod/audit/use-audit-list";
import { useStaffIdentity } from "@/components/providers/staff-provider";
import { useCase } from "@/hooks/mod/use-case";

import type { JsonPatchOperation } from "@/components/mod/audit/diff-view";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asJsonPatch(value: unknown): JsonPatchOperation[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	return value.filter((entry): entry is JsonPatchOperation => isRecord(entry) && typeof entry.op === "string" && typeof entry.path === "string");
}

function formatDay(value: string): string {
	try {
		return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	} catch {
		return value;
	}
}

function formatTime(value: string): string {
	try {
		return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
	} catch {
		return value;
	}
}

export default function CaseTimelinePage() {
	const params = useParams<{ caseId: string }>();
	const caseId = params.caseId;
	const { profile } = useStaffIdentity();
	const { data: caseDetail, isLoading: caseLoading } = useCase(caseId);
	const [expanded, setExpanded] = useState<string | null>(null);

	const auditQuery = useMemo(() => ({ target_type: "case", target_id: caseId }), [caseId]);
	const auditList = useAuditList(auditQuery);
	const events = useMemo(() => {
		const list = flattenAuditPages(auditList.data?.pages);
		return [...list].sort((left, right) => (left.created_at > right.created_at ? -1 : 1));
	}, [auditList.data?.pages]);

	const grouped = useMemo(() => {
		const groups = new Map<string, typeof events>();
		events.forEach((event) => {
			const day = event.created_at.slice(0, 10);
			const bucket = groups.get(day) ?? [];
			bucket.push(event);
			groups.set(day, bucket);
		});
		return Array.from(groups.entries()).sort(([left], [right]) => (left > right ? -1 : 1));
	}, [events]);

	const isAdmin = useMemo(() => profile.scopes?.some((scope) => scope === "staff.admin"), [profile.scopes]);

	const jumpAnchors = useMemo(() => {
		const anchors: Array<{ id: string; label: string }> = [];
		const firstReport = [...events].reverse().find((event) => event.action.includes("report"));
		if (firstReport) anchors.push({ id: `event-${firstReport.id}`, label: "First report" });
		const firstAction = events.find((event) => event.action.includes("action.apply"));
		if (firstAction) anchors.push({ id: `event-${firstAction.id}`, label: "First action" });
		const appealEvent = events.find((event) => event.action.includes("appeal"));
		if (appealEvent) anchors.push({ id: `event-${appealEvent.id}`, label: "Appeal" });
		const closureEvent = events.find((event) => event.action.includes("case.close"));
		if (closureEvent) anchors.push({ id: `event-${closureEvent.id}`, label: "Closure" });
		return anchors;
	}, [events]);

	useEffect(() => {
		if (events.length && !expanded) {
			setExpanded(events[0].id);
		}
	}, [events, expanded]);

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
				<h1 className="text-xl font-semibold text-slate-900">Case {caseId} timeline</h1>
				{caseLoading ? (
					<p className="text-sm text-slate-500">Loading case details…</p>
				) : caseDetail ? (
					<ul className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
						<li>Status: {caseDetail.status ?? "--"}</li>
						<li>Severity: {caseDetail.severity ?? "--"}</li>
						<li>Assigned: {caseDetail.assigned_to ?? "Unassigned"}</li>
						{caseDetail.appeal?.status ? <li>Appeal: {caseDetail.appeal.status}</li> : null}
					</ul>
				) : (
					<p className="text-sm text-rose-500">Unable to load case details.</p>
				)}
				{jumpAnchors.length ? (
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jump to</span>
						{jumpAnchors.map((anchor) => (
							<button
								key={anchor.id}
								type="button"
								onClick={() => document.getElementById(anchor.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
								className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
							>
								{anchor.label}
							</button>
						))}
					</div>
				) : null}
			</header>
			<section className="space-y-6">
				{grouped.length ? (
					grouped.map(([day, entries]) => (
						<div key={day} className="space-y-4">
							<div className="sticky top-0 z-10 rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
								{formatDay(day)}
							</div>
							<ol className="space-y-4">
								{entries.map((event) => {
									const meta = event.meta ?? {};
									const beforeRaw = (meta as { before?: unknown }).before;
									const afterRaw = (meta as { after?: unknown }).after;
									const diffRaw = (meta as { diff?: unknown }).diff;
									const before = isRecord(beforeRaw) ? beforeRaw : null;
									const after = isRecord(afterRaw) ? afterRaw : null;
									const diff = asJsonPatch(diffRaw) ?? undefined;
									return (
										<li key={event.id} id={`event-${event.id}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
											<header className="flex flex-wrap items-center justify-between gap-3">
												<div className="flex flex-col gap-1">
													<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatTime(event.created_at)}</span>
													<span className="text-sm font-semibold text-slate-800">{event.action}</span>
													<span className="text-xs text-slate-500">Actor: {event.actor_id ?? "System"}</span>
												</div>
												<button
													type="button"
													onClick={() => setExpanded((current) => (current === event.id ? null : event.id))}
													className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
												>
													{expanded === event.id ? "Collapse" : "Expand"}
												</button>
											</header>
											{expanded === event.id ? (
												<div className="mt-4 space-y-4">
													<DiffView before={before} after={after} diff={diff} isAdmin={isAdmin} />
													<MetaPretty meta={event.meta} isAdmin={isAdmin} collapsedLines={8} />
												</div>
											) : null}
										</li>
									);
								})}
							</ol>
						</div>
					))
				) : (
					<p className=" rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No audit events for this case yet.</p>
				)}
				{auditList.hasNextPage ? (
					<div className="flex justify-center">
						<button
							type="button"
							onClick={() => auditList.fetchNextPage()}
							disabled={auditList.isFetchingNextPage}
							className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{auditList.isFetchingNextPage ? "Loading…" : "Load more"}
						</button>
					</div>
				) : null}
			</section>
		</div>
	);
}
