"use client";

import { useCallback, useEffect, useMemo } from "react";

import type { CaseSummary } from "@/hooks/mod/triage/use-queue";
import type { CaseActionType } from "@/hooks/mod/triage/use-case-actions";
import { useCaseActions } from "@/hooks/mod/triage/use-case-actions";
import { useCannedActions } from "@/hooks/mod/triage/use-canned";
import { useClaimLock } from "@/hooks/mod/triage/use-claim-lock";
import { useSlaTargets } from "@/hooks/mod/triage/use-sla";
import { useCase } from "@/hooks/mod/use-case";
import { useStaffIdentity } from "@/components/providers/staff-provider";

import { CannedActions, type CannedActionSelection } from "./canned-actions";
import { QuickNote } from "./quick-note";
import { SlaBadge } from "./sla-badge";

export type CaseDrawerProps = {
	open: boolean;
	caseId: string | null;
	summary: CaseSummary | null;
	onClose(): void;
	onActionComplete?: (action: CaseActionType, caseId: string) => void;
	skipAfterAction: boolean;
	onToggleSkip(): void;
	onOpenShortcuts?: () => void;
};

const PRESET_ACTIONS: Record<"harassment" | "spam" | "nsfw", { type: CaseActionType; payload?: Record<string, unknown> }> = {
	harassment: { type: "tombstone", payload: { preset: "harassment" } },
	spam: { type: "remove", payload: { preset: "spam", enforcement: "shadow_restrict" } },
	nsfw: { type: "remove", payload: { preset: "nsfw", enforcement: "content_remove" } },
};

export function CaseDrawer({ open, caseId, summary, onClose, onActionComplete, skipAfterAction, onToggleSkip, onOpenShortcuts }: CaseDrawerProps) {
	const { profile } = useStaffIdentity();
	const moderatorId = profile.id ?? null;

	useEffect(() => {
		function handleKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}
		if (open) {
			window.addEventListener("keydown", handleKey);
			return () => window.removeEventListener("keydown", handleKey);
		}
		return undefined;
	}, [open, onClose]);

	const initialLock = useMemo(() => {
		if (!summary) return null;
		return {
			caseId: summary.id,
			lockedBy: summary.locked_by ?? null,
			expiresAt: summary.lock_expires_at ?? null,
		};
	}, [summary]);

	const { takeLock, releaseLock, lock, lockedByMe, isLocked, pending: lockPending } = useClaimLock({
		caseId,
		moderatorId,
		initialLock: initialLock ?? undefined,
	});

	const { data: caseDetail, isLoading, isError, error, refetch } = useCase(caseId ?? "");
	const { data: macroData } = useCannedActions();
	const macros = macroData?.items ?? [];

	const { getState } = useSlaTargets();
	const slaCompute = summary
		? () =>
				getState({
					severity: summary.severity,
					createdAt: summary.created_at,
					slaDueAt: summary.sla_due_at ?? null,
				})
		: null;

	const { mutateAsync: runAction, isPending: actionPending } = useCaseActions();

	const currentLockOwner = lock?.lockedBy ?? summary?.locked_by ?? null;
	const detailAssigned = (caseDetail as { assigned_to_name?: string | null } | undefined)?.assigned_to_name;
	const assignment = summary?.assigned_to_name ?? detailAssigned ?? summary?.assigned_to ?? caseDetail?.assigned_to ?? null;

	const handleAction = useCallback(
		async (action: CaseActionType, payload?: Record<string, unknown>) => {
			if (!caseId) {
				return;
			}
			try {
				await runAction({ caseId, type: action, payload });
				onActionComplete?.(action, caseId);
			} catch (mutationError) {
				console.error("Failed to run triage action", mutationError);
			}
		},
		[caseId, onActionComplete, runAction],
	);

	const handlePresetSelect = useCallback(
		(selection: CannedActionSelection) => {
			if (!caseId) {
				return;
			}
			if (selection.kind === "preset") {
				const preset = PRESET_ACTIONS[selection.id];
				void handleAction(preset.type, preset.payload);
			} else {
				void handleAction("macro", { macro: selection.macro.key, version: selection.macro.version });
			}
		},
		[caseId, handleAction],
	);

	if (!open || !caseId) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label={`Case ${caseId} drawer`} onClick={onClose}>
			<div className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
				<header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-3">
							<h2 className="text-lg font-semibold text-slate-900">Case {caseId}</h2>
							{summary ? <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">Severity {summary.severity}</span> : null}
							{slaCompute ? <SlaBadge compute={slaCompute} /> : null}
						</div>
						<p className="text-sm text-slate-600">{summary?.subject ?? caseDetail?.subject_id ?? "Unknown subject"}</p>
						<div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
							<span>Status: {summary?.status ?? caseDetail?.status ?? "--"}</span>
							<span>Assigned: {assignment ?? "Unassigned"}</span>
							{currentLockOwner ? <span className="text-amber-600">Locked by {currentLockOwner}</span> : <span>Unclaimed</span>}
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<button
								type="button"
								onClick={() => void handleAction("assign", { moderator_id: moderatorId })}
								disabled={!moderatorId || actionPending || (isLocked && !lockedByMe)}
								className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Assign to me
							</button>
							<button
								type="button"
								onClick={() => void handleAction("escalate")}
								disabled={actionPending || (isLocked && !lockedByMe)}
								className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Escalate
							</button>
							<button
								type="button"
								onClick={() => void handleAction("dismiss")}
								disabled={actionPending || (isLocked && !lockedByMe)}
								className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Dismiss
							</button>
							<button
								type="button"
								onClick={() => void handleAction("tombstone")}
								disabled={actionPending || (isLocked && !lockedByMe)}
								className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
							>
								Tombstone
							</button>
							<button
								type="button"
								onClick={() => void handleAction("remove")}
								disabled={actionPending || (isLocked && !lockedByMe)}
								className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Remove
							</button>
							<button
								type="button"
								onClick={lockedByMe ? () => void releaseLock() : () => void takeLock()}
								disabled={lockPending || (!lockedByMe && isLocked)}
								className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{lockedByMe ? "Release lock" : isLocked ? "Locked" : "Claim lock"}
							</button>
							<button
								type="button"
								onClick={() => onOpenShortcuts?.()}
								className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-300"
							>
								Shortcuts
							</button>
							<button
								type="button"
								onClick={onClose}
								className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-300"
							>
								Close
							</button>
						</div>
						<label className="flex items-center gap-2 text-xs text-slate-600">
							<input type="checkbox" checked={skipAfterAction} onChange={() => onToggleSkip()} />
							<span>Skip to next case after action</span>
						</label>
					</div>
				</header>
				<div className="flex-1 space-y-6 px-6 py-6">
					{isLocked && !lockedByMe ? (
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
							This case is currently locked by {currentLockOwner}. Actions are disabled until it is released.
						</div>
					) : null}
					{isError ? (
						<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{error instanceof Error ? error.message : "Unable to load case details."}
						</div>
					) : null}
					{isLoading && !caseDetail ? <p className="text-sm text-slate-500">Loading case details…</p> : null}
					{caseDetail ? (
						<div className="space-y-4">
							<section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
								<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
								<p className="mt-2 text-sm text-slate-700">Subject {caseDetail.subject_type} · {caseDetail.subject_id}</p>
								<p className="text-sm text-slate-600">Reason: {caseDetail.reason ?? "--"}</p>
								{caseDetail.campus_id ? <p className="text-sm text-slate-600">Campus: {caseDetail.campus_id}</p> : null}
							</section>
							{caseDetail.timeline?.length ? (
								<section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
									<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent timeline</h3>
									<ul className="mt-3 space-y-2 text-sm text-slate-600">
										{caseDetail.timeline.slice(0, 5).map((event) => (
											<li key={event.id}>
												<span className="font-semibold text-slate-900">{new Date(event.occurred_at).toLocaleString()}</span>
												{": "}
												<span>{event.description}</span>
											</li>
										))}
									</ul>
								</section>
							) : null}
						</div>
					) : null}
					<QuickNote caseId={caseId} onSubmitted={() => void refetch()} />
					<CannedActions macros={macros} onSelect={handlePresetSelect} disabled={actionPending || (isLocked && !lockedByMe)} />
				</div>
			</div>
		</div>
	);
}
