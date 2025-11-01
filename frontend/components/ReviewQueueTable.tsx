"use client";

import { useMemo, useState } from "react";

import type { VerificationEntry } from "@/lib/types";

type ReviewQueueTableProps = {
	items: VerificationEntry[];
	onDecision: (verificationId: string, approve: boolean, note?: string) => Promise<void>;
	loading?: boolean;
};

type WorkingState = {
	[verificationId: string]: boolean;
};

type NotesState = {
	[verificationId: string]: string;
};

export default function ReviewQueueTable({ items, onDecision, loading = false }: ReviewQueueTableProps) {
	const [working, setWorking] = useState<WorkingState>({});
	const [notes, setNotes] = useState<NotesState>({});
	const [error, setError] = useState<string | null>(null);

	const sortedItems = useMemo(
		() => [...items].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
		[items],
	);

	const handleDecision = async (verificationId: string, approve: boolean) => {
		setError(null);
		setWorking((current) => ({ ...current, [verificationId]: true }));
		try {
			await onDecision(verificationId, approve, notes[verificationId]?.trim() || undefined);
			setNotes((current) => ({ ...current, [verificationId]: "" }));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to submit decision");
		} finally {
			setWorking((current) => ({ ...current, [verificationId]: false }));
		}
	};

	const renderEvidence = (entry: VerificationEntry) => {
		const evidence = entry.evidence || {};
		if (entry.method === "doc") {
			const key = typeof evidence["s3_key"] === "string" ? (evidence["s3_key"] as string) : "";
			const mime = typeof evidence["mime"] === "string" ? (evidence["mime"] as string) : "";
			return `Document ${key ? key.slice(0, 16) + "…" : ""} (${mime || "unknown"})`;
		}
		if (entry.method === "sso") {
			const provider = typeof evidence["provider"] === "string" ? (evidence["provider"] as string) : "";
			const email = typeof evidence["email"] === "string" ? (evidence["email"] as string) : "";
			return `${provider || "sso"} · ${email}`;
		}
		return JSON.stringify(evidence);
	};

	return (
		<section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
			<header className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-slate-900">Pending verifications</h2>
				<span className="text-xs text-slate-500">
					{loading ? "Refreshing…" : `${sortedItems.length} item${sortedItems.length === 1 ? "" : "s"}`}
				</span>
			</header>
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
			) : null}
			<div className="overflow-x-auto">
				<table className="min-w-full border-separate text-left text-xs">
					<thead>
						<tr className="text-slate-500">
							<th className="border-b border-slate-200 px-3 py-2">Method</th>
							<th className="border-b border-slate-200 px-3 py-2">Evidence</th>
							<th className="border-b border-slate-200 px-3 py-2">Submitted</th>
							<th className="border-b border-slate-200 px-3 py-2">Decision</th>
						</tr>
					</thead>
					<tbody>
						{sortedItems.length ? (
							sortedItems.map((entry) => {
								const isWorking = working[entry.id] ?? false;
								return (
									<tr key={entry.id} className="border-b border-slate-100">
										<td className="px-3 py-3 font-medium text-slate-800">{entry.method.toUpperCase()}</td>
										<td className="px-3 py-3 text-slate-600">
											{renderEvidence(entry)}
											{entry.reason ? (
												<p className="text-rose-600">Reason: {entry.reason}</p>
											) : null}
										</td>
										<td className="px-3 py-3 text-slate-600">
											{new Date(entry.created_at).toLocaleString()}
										</td>
										<td className="px-3 py-3">
											<label className="mb-2 flex flex-col gap-1 text-[11px] text-slate-500">
												<span>Optional moderator note</span>
												<textarea
													value={notes[entry.id] ?? ""}
													onChange={(event) =>
														setNotes((current) => ({ ...current, [entry.id]: event.target.value }))
													}
													rows={2}
													className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
												/>
											</label>
											<div className="flex flex-wrap gap-2">
												<button
													type="button"
													onClick={() => void handleDecision(entry.id, true)}
													disabled={isWorking}
													className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
												>
													Approve
												</button>
												<button
													type="button"
													onClick={() => void handleDecision(entry.id, false)}
													disabled={isWorking}
													className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
												>
													Reject
												</button>
											</div>
										</td>
									</tr>
								);
							})
						) : (
							<tr>
								<td colSpan={4} className="px-3 py-6 text-center text-slate-500">
									No pending verifications.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}
