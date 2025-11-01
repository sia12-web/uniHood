"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
	completeAccountLink,
	listLinkProviders,
	listLinkedAccounts,
	startAccountLink,
	unlinkAccountProvider,
} from "@/lib/account";
import { getDemoUserCampus, getDemoUserId } from "@/lib/env";
import type { LinkStartResponse, LinkedAccountRow } from "@/lib/types";

type LinkedAccountsProps = {
	userId?: string;
	campusId?: string | null;
};

function normaliseCampusId(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export default function LinkedAccounts({ userId, campusId }: LinkedAccountsProps) {
	const resolvedUserId = useMemo(() => userId ?? getDemoUserId(), [userId]);
		const resolvedCampusId = useMemo(
			() => normaliseCampusId(campusId ?? getDemoUserCampus()),
			[campusId],
		);
	const [providers, setProviders] = useState<string[]>([]);
	const [accounts, setAccounts] = useState<LinkedAccountRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [lastStart, setLastStart] = useState<LinkStartResponse | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [providerList, linkedList] = await Promise.all([
				listLinkProviders(resolvedUserId, resolvedCampusId),
				listLinkedAccounts(resolvedUserId, resolvedCampusId),
			]);
			setProviders(providerList);
			setAccounts(linkedList);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to load linked accounts");
		} finally {
			setLoading(false);
		}
	}, [resolvedUserId, resolvedCampusId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleLink = async (provider: string) => {
		const suggestedSubject = `demo-${provider}-${Date.now()}`;
			const subjectInput = window.prompt("Enter the provider subject", suggestedSubject);
			const subjectValue = subjectInput ? subjectInput.trim() : "";
			if (!subjectValue) {
			return;
		}
		const emailInput = window.prompt(
			"Enter provider email (optional)",
			`${provider}@example.edu`,
		);
			const emailValue = emailInput?.trim() ?? "";
		setBusy(true);
		setError(null);
		setMessage(null);
			try {
				const start = await startAccountLink(resolvedUserId, resolvedCampusId, provider);
				await completeAccountLink(
					resolvedUserId,
					resolvedCampusId,
					provider,
					subjectValue,
					emailValue || undefined,
				);
				setLastStart(start);
				await refresh();
				const descriptor = emailValue ? `${subjectValue} (${emailValue})` : subjectValue;
				setMessage(`Linked ${provider} identity ${descriptor}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to link account");
		} finally {
			setBusy(false);
		}
	};

	const handleUnlink = async (provider: string) => {
		if (!window.confirm(`Remove linked ${provider} account?`)) {
			return;
		}
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			await unlinkAccountProvider(resolvedUserId, resolvedCampusId, provider);
			await refresh();
			setMessage(`Removed linked ${provider} account`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to unlink account");
		} finally {
			setBusy(false);
		}
	};

	if (loading) {
		return (
			<section className="rounded border border-slate-200 bg-white p-6 shadow-sm">
				<p className="text-sm text-slate-500">Loading linked account information…</p>
			</section>
		);
	}

	return (
		<section className="space-y-6">
			<header className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
				<h2 className="text-lg font-semibold text-slate-900">Linked sign-in providers</h2>
				<p className="text-sm text-slate-500">
					Connect OAuth identities so users can sign in with SSO and still inherit their existing Divan profile.
				</p>
			</header>
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
			) : null}
			{message ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
			) : null}
			<div className="grid gap-6 lg:grid-cols-2">
				<section className="space-y-3 rounded border border-slate-200 bg-white p-4 shadow-sm">
					<header className="flex items-center justify-between">
						<h3 className="text-base font-semibold text-slate-900">Available providers</h3>
						<span className="text-xs uppercase tracking-wide text-slate-500">Demo only</span>
					</header>
					{providers.length === 0 ? (
						<p className="text-sm text-slate-500">No providers enabled for this user.</p>
					) : (
						<ul className="space-y-2">
							{providers.map((provider) => (
								<li key={provider} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
									<div>
										<p className="text-sm font-medium text-slate-800">{provider}</p>
										<p className="text-xs text-slate-500">Starts OAuth hand-off then simulates the callback.</p>
									</div>
									<button
										type="button"
										onClick={() => void handleLink(provider)}
										className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:bg-indigo-300"
										disabled={busy}
									>
										Link provider
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
				<section className="space-y-3 rounded border border-slate-200 bg-white p-4 shadow-sm">
					<h3 className="text-base font-semibold text-slate-900">Linked identities</h3>
					{accounts.length === 0 ? (
						<p className="text-sm text-slate-500">No linked identities yet.</p>
					) : (
						<ul className="space-y-2">
							{accounts.map((account) => (
								<li key={`${account.provider}-${account.subject}`} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
									<div>
										<p className="text-sm font-medium text-slate-800">{account.provider}</p>
										<p className="text-xs text-slate-500">
											Subject {account.subject}
											{account.email ? ` · ${account.email}` : ""}
										</p>
										<p className="text-[11px] text-slate-400">Linked {new Date(account.created_at).toLocaleString()}</p>
									</div>
									<button
										type="button"
										onClick={() => void handleUnlink(account.provider)}
										className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
										disabled={busy}
									>
										Unlink
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
			{lastStart ? (
				<section className="rounded border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
					<p className="font-semibold text-slate-700">Latest OAuth hand-off (debug)</p>
					<dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div>
							<dt className="uppercase tracking-wide text-[10px] text-slate-500">Authorize URL</dt>
							<dd className="break-all">{lastStart.authorizeUrl}</dd>
						</div>
						<div>
							<dt className="uppercase tracking-wide text-[10px] text-slate-500">State</dt>
							<dd className="break-all">{lastStart.state}</dd>
						</div>
						<div>
							<dt className="uppercase tracking-wide text-[10px] text-slate-500">Code verifier</dt>
							<dd className="break-all">{lastStart.codeVerifier}</dd>
						</div>
						<div>
							<dt className="uppercase tracking-wide text-[10px] text-slate-500">Code challenge</dt>
							<dd className="break-all">{lastStart.codeChallenge}</dd>
						</div>
					</dl>
				</section>
			) : null}
		</section>
	);
}
