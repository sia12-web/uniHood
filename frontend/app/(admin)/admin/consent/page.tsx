"use client";

import { useCallback, useEffect, useState } from "react";

import ConsentViewer from "@/components/ConsentViewer";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { acceptConsent, fetchConsentGate, fetchPolicies, fetchUserConsents } from "@/lib/consent";
import type { ConsentGateResponse, ConsentRecordRow, PolicyDocumentRow } from "@/lib/types";

export default function AdminConsentPage() {
	const adminId = getDemoUserId();
	const campusId = getDemoCampusId();
	const [policies, setPolicies] = useState<PolicyDocumentRow[]>([]);
	const [consents, setConsents] = useState<ConsentRecordRow[]>([]);
	const [gate, setGate] = useState<ConsentGateResponse | null>(null);
	const [busy, setBusy] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const loadAll = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			const [policyDocs, consentRecords, gateState] = await Promise.all([
				fetchPolicies(),
				fetchUserConsents(adminId, campusId),
				fetchConsentGate(adminId, campusId),
			]);
			setPolicies(policyDocs);
			setConsents(consentRecords);
			setGate(gateState);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load consent data");
		} finally {
			setBusy(false);
		}
	}, [adminId, campusId]);

	useEffect(() => {
		void loadAll();
	}, [loadAll]);

	const handleAccept = async (payload: { slug: string; version: string; accepted: boolean }) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const latestConsents = await acceptConsent(adminId, payload, campusId);
			setConsents(latestConsents);
			const gateUpdate = await fetchConsentGate(adminId, campusId);
			setGate(gateUpdate);
			setSuccess(`Updated consent for ${payload.slug}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update consent");
		} finally {
			setBusy(false);
		}
	};

	const missing = gate?.missing ?? [];

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Consent manager</h1>
					<p className="text-sm text-slate-600">Review policy documents and record acknowledgements for Campus admins.</p>
				</div>
				<button
					type="button"
					onClick={() => void loadAll()}
					disabled={busy}
					className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
				>
					{busy ? "Refreshing…" : "Refresh"}
				</button>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{success ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
			<ConsentViewer policies={policies} consents={consents} gate={gate ?? undefined} onAccept={handleAccept} busy={busy} />
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Gate status</h2>
				{gate ? (
					<div className="mt-3 space-y-2 text-sm text-slate-600">
						<p>
							<span className="font-medium">Missing consents:</span> {missing.length > 0 ? missing.length : "None"}
						</p>
						{missing.length > 0 ? (
							<ul className="list-inside list-disc text-xs text-amber-700">
								{missing.map((item) => (
									<li key={`${item.slug}:${item.version}`}>{item.slug} · version {item.version}</li>
								))}
							</ul>
						) : (
							<p className="text-xs text-emerald-700">All required consents recorded.</p>
						)}
					</div>
				) : (
					<p className="mt-2 text-sm text-slate-500">Consent gate status unavailable.</p>
				)}
			</section>
		</main>
	);
}
