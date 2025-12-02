"use client";

import { useCallback, useEffect, useState } from "react";

import ReviewQueueTable from "@/components/ReviewQueueTable";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { decideVerification, listVerificationQueue } from "@/lib/verification";
import type { VerificationEntry } from "@/lib/types";

export default function AdminVerificationPage() {
	const adminUserId = getDemoUserId();
	const campusId = getDemoCampusId();
	const [queue, setQueue] = useState<VerificationEntry[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const items = await listVerificationQueue(adminUserId, campusId);
			setQueue(items);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load verification queue");
		} finally {
			setLoading(false);
		}
	}, [adminUserId, campusId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleDecision = async (verificationId: string, approve: boolean, note?: string) => {
		setError(null);
		setSuccess(null);
		try {
			const updated = await decideVerification(adminUserId, campusId, verificationId, {
				approve,
				note,
			});
			setQueue((current) => current.filter((item) => item.id !== verificationId));
			setSuccess(
				approve ? "Verification approved and trust recompute queued." : "Verification rejected and audit logged.",
			);
			setQueue((current) => [updated, ...current]);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to submit decision");
		}
	};

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-semibold text-slate-900">Verification moderation</h1>
					<button
						type="button"
						onClick={() => void refresh()}
						disabled={loading}
						className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
					>
						{loading ? "Refreshing…" : "Refresh queue"}
					</button>
				</div>
				<p className="text-sm text-slate-600">
					Approve or reject student document submissions. Decisions automatically recompute trust levels and append to
					the moderation audit log.
				</p>
			</header>
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
			) : null}
			{success ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
			) : null}
			<ReviewQueueTable items={queue} onDecision={handleDecision} loading={loading} />
		</main>
	);
}
