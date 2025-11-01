"use client";

import { useMemo, useState } from "react";

import type { ConsentGateResponse, ConsentRecordRow, PolicyDocumentRow } from "@/lib/types";

interface ConsentViewerProps {
	policies: PolicyDocumentRow[];
	consents: ConsentRecordRow[];
	gate?: ConsentGateResponse;
	onAccept?: (payload: { slug: string; version: string; accepted: boolean }) => Promise<void> | void;
	busy?: boolean;
}

function normaliseConsents(consents: ConsentRecordRow[]): Record<string, ConsentRecordRow> {
	const latest: Record<string, ConsentRecordRow> = {};
	for (const record of consents) {
		const existing = latest[record.policy_slug];
		if (!existing || new Date(record.accepted_at).getTime() > new Date(existing.accepted_at).getTime()) {
			latest[record.policy_slug] = record;
		}
	}
	return latest;
}

export default function ConsentViewer({ policies, consents, gate, onAccept, busy = false }: ConsentViewerProps) {
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const consentMap = useMemo(() => normaliseConsents(consents), [consents]);
	const missingSlugs = useMemo(() => new Set(gate?.missing.map((item) => item.slug) ?? []), [gate]);

	const handleAccept = async (policy: PolicyDocumentRow) => {
		if (!onAccept) {
			return;
		}
		setMessage(null);
		setError(null);
		try {
			await onAccept({ slug: policy.slug, version: policy.version, accepted: true });
			setMessage(`Accepted ${policy.title}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to record consent");
		}
	};

	return (
		<div className="space-y-4">
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{message ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
			{policies.length === 0 ? (
				<p className="text-sm text-slate-500">No policy documents published yet.</p>
			) : (
				<ul className="space-y-4">
					{policies.map((policyDoc) => {
						const consent = consentMap[policyDoc.slug];
						const isMissing = missingSlugs.has(policyDoc.slug);
						const isAccepted = consent?.accepted === true && consent.version === policyDoc.version;
						return (
							<li key={`${policyDoc.slug}:${policyDoc.version}`} className="rounded border border-slate-200 bg-white shadow-sm">
								<div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<h3 className="text-base font-semibold text-slate-900">{policyDoc.title}</h3>
										<p className="text-xs uppercase tracking-wide text-slate-500">
											Version {policyDoc.version} · {policyDoc.required ? "Required" : "Optional"}
										</p>
									</div>
									<div className="text-right text-sm">
										{isAccepted ? (
											<span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Accepted</span>
										) : isMissing ? (
											<span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Action needed</span>
										) : consent ? (
											<span className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">Outdated</span>
										) : (
											<span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">Pending</span>
										)}
									</div>
								</div>
								<div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-700">{policyDoc.content_md}</div>
								<div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
									<span>Updated {new Date(policyDoc.created_at).toLocaleDateString()}</span>
									{onAccept ? (
										<button
											type="button"
											disabled={busy || isAccepted}
											onClick={() => void handleAccept(policyDoc)}
											className="rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
										>
											{isAccepted ? "Accepted" : "Accept policy"}
										</button>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
