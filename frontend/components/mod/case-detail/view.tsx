'use client';

import { useCallback, useMemo } from "react";

import { CaseAppealPanel } from "@/components/mod/case-detail/appeal";
import { CaseDetailHeader } from "@/components/mod/case-detail/header";
import { CaseDetailTabs } from "@/components/mod/case-detail/tabs";
import { CaseReporters } from "@/components/mod/case-detail/reporters";
import { CaseReputationPanel } from "@/components/mod/case-detail/reputation";
import { CaseSubject } from "@/components/mod/case-detail/subject";
import { CaseTimeline } from "@/components/mod/case-detail/timeline";
import type { CaseActionRequest } from "@/hooks/mod/use-case";
import { useCase, useCaseAction } from "@/hooks/mod/use-case";
import { useAudit } from "@/hooks/mod/use-audit";
import { useReputation } from "@/hooks/mod/use-reputation";
import { useRestrictionMutations, useRestrictions } from "@/hooks/mod/use-restrictions";
import type { RestrictionMode } from "@/hooks/mod/user/use-restrictions";

export default function CaseDetailView({ caseId }: { caseId: string }) {
	const { data: caseItem, isLoading, error } = useCase(caseId);
	const { mutateAsync: runCaseAction, isPending: actionPending } = useCaseAction(caseId);

	const auditTargetId = caseItem?.id ?? null;
	const { data: auditLogs } = useAudit(auditTargetId);

	const subjectUserId = caseItem?.subject_type === "user" ? caseItem.subject_id ?? null : null;
	const { data: reputation } = useReputation(subjectUserId);
	const { data: restrictions } = useRestrictions(subjectUserId);
	const { create: createRestriction } = useRestrictionMutations(subjectUserId);

	const timelineEvents = useMemo(() => {
		if (caseItem?.timeline?.length) {
			return caseItem.timeline;
		}
		if (auditLogs?.items?.length) {
			return auditLogs.items.map((entry) => ({
				id: entry.id,
				type: entry.type,
				description: entry.message,
				actor: entry.actor,
				occurred_at: entry.created_at,
			}));
		}
		return [];
	}, [caseItem?.timeline, auditLogs]);

	const handleAction = useCallback(
		async (payload: CaseActionRequest) => {
			if (actionPending) {
				return;
			}
			try {
				await runCaseAction(payload);
			} catch (mutationError) {
				console.error("Failed to apply case action", mutationError);
			}
		},
		[actionPending, runCaseAction]
	);

	const handleAddRestriction = useCallback(async () => {
		if (!subjectUserId) {
			return;
		}
		const modeInput = window.prompt("Enter restriction mode (cooldown, shadow_restrict, captcha, hard_block)", "cooldown");
		if (!modeInput) {
			return;
		}
		const scopeInput = window.prompt("Restriction scope (global, comment, message)", "global") ?? "global";
		const durationInput = window.prompt("Duration in minutes (blank for default)", "60");
		const reasonInput = window.prompt("Reason note", "Applied from case detail") ?? "Applied from case detail";
		const ttlMinutes = durationInput ? Number(durationInput) : NaN;
		const ttlSeconds = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? Math.round(ttlMinutes * 60) : undefined;
		const mode = modeInput.trim() as RestrictionMode;
		const scope = scopeInput.trim() || "global";
		const reason = reasonInput.trim() || "Manual restriction";
		try {
			await createRestriction.mutateAsync({
				user_id: subjectUserId,
				scope,
				mode,
				reason,
				ttl_seconds: ttlSeconds,
			});
		} catch (mutationError) {
			console.error("Failed to create restriction", mutationError);
		}
	}, [createRestriction, subjectUserId]);

	if (isLoading) {
		return <p className="text-sm text-slate-500">Loading case...</p>;
	}

	if (error || !caseItem) {
		const message = error instanceof Error ? error.message : "Unable to load case";
		return <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
	}

	const tabs = [
		{ id: "timeline", label: "Timeline", content: <CaseTimeline events={timelineEvents} /> },
		{ id: "subject", label: "Subject", content: <CaseSubject caseItem={caseItem} /> },
		{ id: "reporters", label: "Reporters", content: <CaseReporters reporters={caseItem.reporters} /> },
		{
			id: "appeal",
			label: "Appeal",
			content: <CaseAppealPanel appeal={caseItem.appeal ?? null} canResolve={false} />,
		},
		{
			id: "reputation",
			label: "Reputation",
			content: (
				<CaseReputationPanel
					reputation={reputation}
					restrictions={restrictions?.items}
					onAddRestriction={handleAddRestriction}
				/>
			),
		},
	];

	return (
		<div className="flex flex-col gap-6">
			<CaseDetailHeader caseItem={caseItem} onAction={handleAction} />
			<CaseDetailTabs tabs={tabs} />
		</div>
	);
}
