"use client";

import { FormEvent, useMemo, useState } from "react";

import { removePhoneNumber, requestPhoneVerification, verifyPhoneCode } from "@/lib/account";
import { getDemoUserCampus, getDemoUserId } from "@/lib/env";
import type { PhoneNumberOut } from "@/lib/types";

type PhoneNumberFormProps = {
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

export default function PhoneNumberForm({ userId, campusId }: PhoneNumberFormProps) {
	const resolvedUserId = useMemo(() => userId ?? getDemoUserId(), [userId]);
		const resolvedCampusId = useMemo(
			() => normaliseCampusId(campusId ?? getDemoUserCampus()),
			[campusId],
		);
	const [phone, setPhone] = useState<string>("+15555550123");
	const [code, setCode] = useState<string>("");
	const [result, setResult] = useState<PhoneNumberOut | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const handleRequest = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextNumber = phone.trim();
		if (!nextNumber) {
			setError("Enter a phone number in E.164 format.");
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			await requestPhoneVerification(resolvedUserId, resolvedCampusId, nextNumber);
			setMessage(`Sent OTP to ${nextNumber}. Check the console or SMS provider log.`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send verification code");
		} finally {
			setLoading(false);
		}
	};

	const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const entered = code.trim();
		if (!entered) {
			setError("Enter the SMS code first.");
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const verified = await verifyPhoneCode(resolvedUserId, resolvedCampusId, entered);
			setResult(verified);
			setMessage(`Phone ${verified.e164} verified.`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to verify code");
		} finally {
			setLoading(false);
		}
	};

	const handleRemove = async () => {
		if (!window.confirm("Remove the verified phone number?")) {
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			await removePhoneNumber(resolvedUserId, resolvedCampusId);
			setResult(null);
			setMessage("Removed phone number");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove phone number");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="space-y-4 rounded border border-slate-200 bg-white p-4 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Phone verification</h2>
				<p className="text-sm text-slate-500">
					Request an OTP via the Phase 8 SMS adapter, then confirm it to attach a verified E.164 number.
				</p>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{message ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
			) : null}
			<form className="space-y-3" onSubmit={handleRequest}>
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone number</span>
					<input
						type="tel"
						value={phone}
						onChange={(event) => setPhone(event.target.value)}
						placeholder="+15555550123"
						className="rounded border border-slate-300 px-3 py-2 shadow-sm"
						disabled={loading}
					/>
				</label>
				<button
					type="submit"
					className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:bg-indigo-300"
					disabled={loading}
				>
					Send code
				</button>
			</form>
			<form className="space-y-3 border-t border-slate-200 pt-3" onSubmit={handleVerify}>
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-xs font-medium uppercase tracking-wide text-slate-500">Verification code</span>
					<input
						type="text"
						value={code}
						onChange={(event) => setCode(event.target.value)}
						placeholder="123456"
						className="rounded border border-slate-300 px-3 py-2 shadow-sm"
						disabled={loading}
					/>
				</label>
				<button
					type="submit"
					className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-600"
					disabled={loading}
				>
					Verify code
				</button>
			</form>
			<div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
				<div className="text-xs text-slate-500">
					<p className="font-semibold text-slate-700">Current status</p>
					{result ? (
						<>
							<p>{result.e164}</p>
										<p>
											{result.verified
												? result.verified_at
													? `Verified ${new Date(result.verified_at).toLocaleString()}`
													: "Verified"
												: "Pending verification"}
										</p>
						</>
					) : (
						<p>No phone attached</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => void handleRemove()}
					className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
					disabled={loading}
				>
					Remove phone
				</button>
			</div>
		</section>
	);
}
