"use client";

import { useEffect, useState } from "react";

import ConsentViewer from "@/components/ConsentViewer";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { acceptConsent, fetchConsentGate, fetchPolicies, fetchUserConsents } from "@/lib/consent";
import type { ConsentGateResponse, ConsentRecordRow, PolicyDocumentRow } from "@/lib/types";

export default function ConsentSettingsPage() {
	const userId = getDemoUserId();
	const campusId = getDemoCampusId();
	const [policies, setPolicies] = useState<PolicyDocumentRow[]>([]);
	const [consents, setConsents] = useState<ConsentRecordRow[]>([]);
	const [gate, setGate] = useState<ConsentGateResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function bootstrap() {
			setLoading(true);
			setError(null);
			try {
				const [policyDocs, consentRecords, gateState] = await Promise.all([
					fetchPolicies(),
					fetchUserConsents(userId, campusId),
					fetchConsentGate(userId, campusId),
				]);
				if (cancelled) {
					return;
				}
				setPolicies(policyDocs);
				setConsents(consentRecords);
				setGate(gateState);
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Unable to load consent settings");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		void bootstrap();
		return () => {
			cancelled = true;
		};
	}, [campusId, userId]);

	const handleAccept = async (payload: { slug: string; version: string; accepted: boolean }) => {
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			const updated = await acceptConsent(userId, payload, campusId);
			setConsents(updated);
			const gateState = await fetchConsentGate(userId, campusId);
			setGate(gateState);
			setMessage(`Acknowledged ${payload.slug}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to update consent");
		} finally {
			setBusy(false);
		}
	};

	if (loading) {
		return <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center p-8 text-sm text-slate-500">Loading consent settings…</main>;
	}

	return (
		<main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-slate-900">Consent preferences</h1>
				<p className="text-sm text-slate-600">Review policy documents and acknowledge required terms for your Campus account.</p>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{message ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
			<ConsentViewer policies={policies} consents={consents} gate={gate ?? undefined} onAccept={handleAccept} busy={busy} />
		</main>
	);
}
