"use client";

import { useCallback, useMemo, useState } from "react";

import { ReputationHeader } from "@/components/mod/user/reputation-header";
import { ScoreCard } from "@/components/mod/user/score-card";
import { EventsTable } from "@/components/mod/user/events-table";
import { AdjustScore } from "@/components/mod/user/adjust-score";
import { RestrictionsPanel } from "@/components/mod/user/restrictions-panel";
import { NewRestrictionDialog, type RestrictionPreset } from "@/components/mod/user/new-restriction-dialog";
import { useReputation } from "@/hooks/mod/user/use-reputation";
import { useReputationEvents } from "@/hooks/mod/user/use-rep-events";
import { useRestrictions } from "@/hooks/mod/user/use-restrictions";
import { useRestrictionMutations } from "@/hooks/mod/user/use-restriction-mutations";
import { useMacroRunner } from "@/hooks/mod/use-macro";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 25;

const ADMIN_PRESETS: RestrictionPreset[] = [
	{ id: "cooldown-15", label: "Comment cooldown · 15m", mode: "cooldown", scope: "comment", ttlSeconds: 15 * 60, reason: "Moderator cooldown preset" },
	{ id: "shadow-24", label: "Shadow restrict · 24h", mode: "shadow_restrict", scope: "global", ttlSeconds: 24 * 60 * 60, reason: "Shadow restrict pending review" },
	{ id: "captcha-24", label: "Captcha gate · 24h", mode: "captcha", scope: "global", ttlSeconds: 24 * 60 * 60, reason: "Captcha gate" },
	{ id: "hard-block-7", label: "Hard block · 7d", mode: "hard_block", scope: "global", ttlSeconds: 7 * 24 * 60 * 60, reason: "Hard block escalation" },
];

const MOD_PRESETS = ADMIN_PRESETS.filter((preset) => preset.mode === "cooldown" || preset.mode === "shadow_restrict");

const MACRO_PRESETS = [
	{ id: "harassment_strike@1", label: "Harassment strike · level 1" },
	{ id: "spam_shadow@1", label: "Spam shadow restrict" },
];

export type UserReputationClientProps = {
	userId: string;
	isAdmin: boolean;
};

export function UserReputationClient({ userId, isAdmin }: UserReputationClientProps) {
	const toast = useToast();
	const [page, setPage] = useState(1);
	const [restrictionView, setRestrictionView] = useState<"active" | "historical">("active");
	const [dialogOpen, setDialogOpen] = useState(false);

	const reputation = useReputation(userId);
	const events = useReputationEvents(userId, page, PAGE_SIZE);
	const activeRestrictions = useRestrictions(userId, true);
	const allRestrictions = useRestrictions(userId, false);
	const { create, revoke } = useRestrictionMutations(userId);
	const { execute } = useMacroRunner();

	const presets = useMemo(() => (isAdmin ? ADMIN_PRESETS : MOD_PRESETS), [isAdmin]);

	const summary = reputation.data;
	const eventsData = events.data;

	const activeList = useMemo(() => activeRestrictions.data?.items ?? [], [activeRestrictions.data?.items]);
	const historicalList = useMemo(() => {
		const items = allRestrictions.data?.items ?? [];
		const activeIds = new Set(activeList.map((item) => item.id));
		return items.filter((item) => !activeIds.has(item.id));
	}, [allRestrictions.data?.items, activeList]);

	const restrictionsLoading = restrictionView === "active" ? activeRestrictions.isLoading : allRestrictions.isLoading;

	const handlePreset = useCallback(
		async (presetId: string) => {
			const preset = presets.find((item) => item.id === presetId);
			if (!preset || create.isPending) return;
			try {
				await create.mutateAsync({
					user_id: userId,
					scope: preset.scope,
					mode: preset.mode,
					reason: preset.reason ?? "Preset restriction",
					ttl_seconds: preset.ttlSeconds,
				});
			} catch (error) {
				console.error("Failed to apply preset", error);
			}
		},
		[create, presets, userId],
	);

	const handleDialogSubmit = useCallback(
		async ({ scope, mode, ttlSeconds, reason }: { scope: string; mode: string; ttlSeconds: number; reason: string }) => {
			await create.mutateAsync({ user_id: userId, scope, mode, reason, ttl_seconds: ttlSeconds });
		},
		[create, userId],
	);

	const handleRevoke = useCallback(
		(restrictionId: string, scope: string | null | undefined, mode: string) => {
			revoke.mutate({ restrictionId, scope: scope ?? "global", mode });
		},
		[revoke],
	);

	const handleMacro = useCallback(
		async (macroId: string) => {
			if (!isAdmin || !macroId) return;
			const durationInput = window.prompt("Optional duration minutes (leave blank for default)");
			const duration = durationInput ? Number(durationInput) : undefined;
			try {
				await execute.mutateAsync({
					macro: macroId,
					selector: { kind: "subjects", subject_type: "user", ids: [userId] },
					variables: duration ? { duration_minutes: duration } : undefined,
				});
				toast.push({
					id: "macro-queued",
					title: "Macro queued",
					description: `${macroId} scheduled for ${userId}`,
					variant: "success",
				});
			} catch (error) {
				const description = error instanceof Error ? error.message : "Unable to run macro";
				toast.push({ id: "macro-error", title: "Macro failed", description, variant: "error" });
			}
		},
		[execute, isAdmin, toast, userId],
	);

	if (reputation.isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-28 animate-pulse rounded-3xl bg-slate-100" />
				<div className="h-40 animate-pulse rounded-3xl bg-slate-100" />
			</div>
		);
	}

	if (reputation.error || !summary) {
		const message = reputation.error instanceof Error ? reputation.error.message : "Unable to load user";
		return <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
	}

	return (
		<div className="space-y-6">
			<ReputationHeader
				userId={summary.user_id}
				displayName={summary.display_name}
				avatarUrl={summary.avatar_url ?? undefined}
				campus={summary.campus ?? undefined}
				verified={summary.verified ?? undefined}
				joinedAt={summary.joined_at ?? undefined}
				riskBand={summary.risk_band}
				extraActions={
					<QuickActions
						presets={presets}
						isAdmin={isAdmin}
						onApplyPreset={handlePreset}
						onOpenDialog={() => setDialogOpen(true)}
						onRunMacro={handleMacro}
						busy={create.isPending || revoke.isPending || execute.isPending}
					/>
				}
			/>
			<ScoreCard score={summary.score} riskBand={summary.risk_band} lastEventAt={summary.last_event_at} />
			{isAdmin ? (
				<AdjustScore userId={summary.user_id} currentScore={summary.score} currentBand={summary.risk_band} thresholds={summary.band_thresholds} />
			) : null}
			<EventsTable
				events={eventsData?.items ?? summary.events_preview ?? []}
				page={page}
				pageSize={PAGE_SIZE}
				total={eventsData?.total ?? summary.total_events}
				loading={events.isLoading}
				error={events.error instanceof Error ? events.error.message : null}
				onPageChange={(next) => {
					setPage(next);
					events.refetch();
				}}
				onRetry={() => events.refetch()}
			/>
			<RestrictionsPanel
				active={activeList}
				historical={historicalList}
				loading={restrictionsLoading}
				view={restrictionView}
				onViewChange={setRestrictionView}
				onCreateRestriction={() => setDialogOpen(true)}
				onRevokeRestriction={(restriction) => handleRevoke(restriction.id, restriction.scope, restriction.mode)}
				canManage={isAdmin || presets.length > 0}
			/>
			<NewRestrictionDialog
				open={dialogOpen}
				onDismiss={() => setDialogOpen(false)}
				onSubmit={handleDialogSubmit}
				presets={presets}
				loading={create.isPending}
				title={`New restriction for ${summary.display_name ?? summary.user_id}`}
			/>
		</div>
	);
}

type QuickActionsProps = {
	presets: RestrictionPreset[];
	isAdmin: boolean;
	onApplyPreset: (presetId: string) => void;
	onOpenDialog: () => void;
	onRunMacro: (macroId: string) => void;
	busy: boolean;
};

function QuickActions({ presets, isAdmin, onApplyPreset, onOpenDialog, onRunMacro, busy }: QuickActionsProps) {
	const [restrictionSelection, setRestrictionSelection] = useState<string>("");
	const [macroSelection, setMacroSelection] = useState<string>("");

	const handleRestrictionChange = (value: string) => {
		setRestrictionSelection(value);
		if (value) {
			onApplyPreset(value);
			setTimeout(() => setRestrictionSelection(""), 100);
		}
	};

	const handleMacroChange = (value: string) => {
		setMacroSelection(value);
		if (value) {
			onRunMacro(value);
			setTimeout(() => setMacroSelection(""), 100);
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-3">
			<select
				value={restrictionSelection}
				onChange={(event) => handleRestrictionChange(event.target.value)}
				className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
				disabled={busy}
				aria-label="Apply restriction preset"
			>
				<option value="">Apply preset…</option>
				{presets.map((preset) => (
					<option key={preset.id} value={preset.id}>
						{preset.label}
					</option>
				))}
			</select>
			<button
				type="button"
				onClick={onOpenDialog}
				disabled={busy}
				className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
			>
				Custom restriction
			</button>
			{isAdmin ? (
				<select
					value={macroSelection}
					onChange={(event) => handleMacroChange(event.target.value)}
					disabled={busy}
					className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
					aria-label="Run macro preset"
				>
					<option value="">Run macro…</option>
					{MACRO_PRESETS.map((macro) => (
						<option key={macro.id} value={macro.id}>
							{macro.label}
						</option>
					))}
				</select>
			) : null}
		</div>
	);
}
