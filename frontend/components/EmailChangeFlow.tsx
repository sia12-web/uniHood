"use client";

import { FormEvent, useMemo, useState } from "react";

import { confirmEmailChange, requestEmailChange } from "@/lib/account";
import { getDemoUserCampus, getDemoUserEmail, getDemoUserId } from "@/lib/env";

type EmailChangeFlowProps = {
	userId?: string;
	campusId?: string | null;
	initialEmail?: string;
};

function normaliseCampusId(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export default function EmailChangeFlow({ userId, campusId, initialEmail }: EmailChangeFlowProps) {
	const resolvedUserId = useMemo(() => userId ?? getDemoUserId(), [userId]);
		const resolvedCampusId = useMemo(
			() => normaliseCampusId(campusId ?? getDemoUserCampus()),
			[campusId],
		);
	const [email, setEmail] = useState<string>(initialEmail ?? getDemoUserEmail());
	const [pendingToken, setPendingToken] = useState<string | null>(null);
	const [inputToken, setInputToken] = useState<string>("");
	const [verificationToken, setVerificationToken] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const handleRequest = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextEmail = email.trim();
		if (!nextEmail) {
			setError("Provide a new email address.");
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		setVerificationToken(null);
		try {
			const response = await requestEmailChange(resolvedUserId, resolvedCampusId, nextEmail);
			setPendingToken(response.token);
			setMessage(`Requested change for ${nextEmail}. Paste the token into the confirm form.`);
			setInputToken(response.token);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to request email change");
		} finally {
			setLoading(false);
		}
	};

	const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const token = inputToken.trim();
		if (!token) {
			setError("Paste the confirmation token first.");
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const response = await confirmEmailChange(token);
			setVerificationToken(response.verificationToken ?? null);
			setPendingToken(null);
			setMessage("Email change complete. Verification token issued for follow-up email verification.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to confirm email change");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="space-y-4 rounded border border-slate-200 bg-white p-4 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Email change</h2>
				<p className="text-sm text-slate-500">
					Stage a new email address and confirm it with the token returned by the request endpoint.
				</p>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{message ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
			) : null}
			<form className="space-y-3" onSubmit={handleRequest}>
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-xs font-medium uppercase tracking-wide text-slate-500">New email</span>
					<input
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="student@university.edu"
						className="rounded border border-slate-300 px-3 py-2 shadow-sm"
						disabled={loading}
					/>
				</label>
				<button
					type="submit"
					className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:bg-indigo-300"
					disabled={loading}
				>
					Request change
				</button>
			</form>
			<form className="space-y-3 border-t border-slate-200 pt-3" onSubmit={handleConfirm}>
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-xs font-medium uppercase tracking-wide text-slate-500">Confirmation token</span>
					<textarea
						value={inputToken}
						onChange={(event) => setInputToken(event.target.value)}
						placeholder="Paste token from API response or email"
						className="h-24 rounded border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm"
						disabled={loading}
					/>
				</label>
				<button
					type="submit"
					className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-600"
					disabled={loading}
				>
					Confirm change
				</button>
			</form>
			{pendingToken ? (
				<div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
					<p className="font-semibold">Pending token (debug)</p>
					<p className="break-all">{pendingToken}</p>
				</div>
			) : null}
			{verificationToken ? (
				<div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
					<p className="font-semibold">Email verification token (debug)</p>
					<p className="break-all">{verificationToken}</p>
				</div>
			) : null}
		</section>
	);
}
