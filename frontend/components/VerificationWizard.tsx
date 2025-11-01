"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import UploadStudentCard from "./UploadStudentCard";
import {
	completeSsoVerification,
	fetchVerificationStatus,
	formatTrustBadge,
	presignVerificationDocument,
	startSsoVerification,
	submitVerificationDocument,
} from "@/lib/verification";
import type { VerificationEntry, VerificationStatus } from "@/lib/types";

type VerificationWizardProps = {
	userId: string;
	campusId: string | null;
};

type SsoStep = "idle" | "starting" | "pending" | "error" | "complete";

type DocStep = "idle" | "uploading" | "error" | "complete";

type PendingSso = {
	provider: string;
	state: string;
	email: string;
};

const PROVIDERS = ["google", "microsoft"] as const;

export default function VerificationWizard({ userId, campusId }: VerificationWizardProps) {
	const [status, setStatus] = useState<VerificationStatus | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [ssoStep, setSsoStep] = useState<SsoStep>("idle");
	const [ssoError, setSsoError] = useState<string | null>(null);
	const [pendingSso, setPendingSso] = useState<PendingSso | null>(null);
	const [docStep, setDocStep] = useState<DocStep>("idle");
	const [docError, setDocError] = useState<string | null>(null);

	const trustBadge = useMemo(() => (status ? formatTrustBadge(status.trust) : "Unverified"), [status]);
	const approvedCount = useMemo(
		() => status?.verifications.filter((entry) => entry.state === "approved").length ?? 0,
		[status],
	);

	const refreshStatus = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const nextStatus = await fetchVerificationStatus(userId, campusId);
			setStatus(nextStatus);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load verification status");
		} finally {
			setLoading(false);
		}
	}, [userId, campusId]);

	useEffect(() => {
		void refreshStatus();
	}, [refreshStatus]);

	const recordEntry = (entry: VerificationEntry) => {
		setStatus((current) => {
			if (!current) {
				return {
					trust: { trust_level: 0, badge: null, verified_at: null, expires_at: null },
					verifications: [entry],
				};
			}
			const existing = current.verifications.filter((item) => item.id !== entry.id);
			return {
				trust: current.trust,
				verifications: [entry, ...existing].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
			};
		});
	};

	const handleStartSso = async (provider: string) => {
		setSsoError(null);
		setSsoStep("starting");
		try {
			const redirect = typeof window !== "undefined" ? `${window.location.origin}/verify/sso/callback` : undefined;
			const payload = await startSsoVerification(userId, campusId, provider, redirect);
			if (typeof window !== "undefined") {
				window.open(payload.authorize_url, "_blank", "noopener,noreferrer");
			}
			setPendingSso({ provider, state: payload.state, email: "" });
			setSsoStep("pending");
		} catch (err) {
			setSsoError(err instanceof Error ? err.message : "Failed to start SSO");
			setSsoStep("error");
		}
	};

	const handleCompleteSso = async () => {
		if (!pendingSso) {
			return;
		}
		if (!pendingSso.email.trim()) {
			setSsoError("Enter a campus email before completing SSO.");
			return;
		}
		setSsoError(null);
		setSsoStep("starting");
		try {
			const idToken = JSON.stringify({ email: pendingSso.email.trim(), email_verified: true });
			const entry = await completeSsoVerification(pendingSso.provider, pendingSso.state, idToken);
			setPendingSso(null);
			setSsoStep("complete");
			recordEntry(entry);
			await refreshStatus();
		} catch (err) {
			setSsoError(err instanceof Error ? err.message : "SSO completion failed");
			setSsoStep("error");
		}
	};

	const handleDocUpload = async (file: File) => {
		setDocError(null);
		setDocStep("uploading");
		try {
			const presign = await presignVerificationDocument(userId, campusId, file.type || "application/octet-stream", file.size);
			const uploadResponse = await fetch(presign.url, {
				method: "PUT",
				headers: {
					"Content-Type": file.type || "application/octet-stream",
				},
				body: file,
			});
			if (!uploadResponse.ok) {
				throw new Error(`Upload failed (${uploadResponse.status})`);
			}
			const entry = await submitVerificationDocument(userId, campusId, presign.key, file.type || undefined);
			recordEntry(entry);
			setDocStep("complete");
			await refreshStatus();
			return entry;
		} catch (err) {
			setDocError(err instanceof Error ? err.message : "Document upload failed");
			setDocStep("error");
			throw err;
		}
	};

	return (
		<section className="flex flex-col gap-6">
			<header className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
				<h2 className="text-lg font-semibold text-slate-900">Verification status</h2>
				<p className="mt-2 text-sm text-slate-600">
					Trust badge: <strong>{trustBadge}</strong>
				</p>
				<p className="text-xs text-slate-500">
					{loading ? "Refreshing status…" : `Approved verifications: ${approvedCount}`}
				</p>
				{error ? (
					<p className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
				) : null}
			</header>

			<section className="flex flex-col gap-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
				<h3 className="text-base font-semibold text-slate-900">Verify via campus SSO</h3>
				<p className="text-xs text-slate-500">
					Start an SSO sign-in with your university provider, then confirm the email shown in the popup to mark your
					account as verified.
				</p>
				<div className="flex flex-wrap gap-3">
					{PROVIDERS.map((provider) => (
						<button
							key={provider}
							type="button"
							onClick={() => void handleStartSso(provider)}
							disabled={ssoStep === "starting" || ssoStep === "pending"}
							className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							Connect {provider.charAt(0).toUpperCase() + provider.slice(1)}
						</button>
					))}
				</div>
				{pendingSso ? (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void handleCompleteSso();
						}}
						className="flex flex-col gap-3 rounded border border-slate-200 bg-slate-50 p-3"
					>
						<label className="flex flex-col gap-1 text-xs text-slate-600">
							<span className="font-semibold text-slate-700">Campus email</span>
							<input
								type="email"
								value={pendingSso.email}
								required
								onChange={(event) => setPendingSso({ ...pendingSso, email: event.target.value })}
								className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
							/>
						</label>
						<p className="text-xs text-slate-500">
							Paste the email shown in the SSO popup. We treat it as the ID token for the demo environment.
						</p>
						<div className="flex items-center gap-3">
							<button
								type="submit"
								disabled={ssoStep === "starting"}
								className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
							>
								{ssoStep === "starting" ? "Completing…" : "Complete SSO"}
							</button>
							<button
								type="button"
								onClick={() => {
								setPendingSso(null);
								setSsoStep("idle");
								setSsoError(null);
							}}
								className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
							>
								Cancel
							</button>
						</div>
						{ssoError ? (
							<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{ssoError}</p>
						) : null}
					</form>
				) : null}
				{ssoStep === "complete" ? (
					<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
						SSO verification added. Trust will refresh shortly.
					</p>
				) : null}
			</section>

			<UploadStudentCard
				onUpload={handleDocUpload}
				onComplete={() => setDocStep("complete")}
				disabled={docStep === "uploading"}
			/>
			{docStep === "complete" ? (
				<p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
					Document submitted for review. You will receive the trust badge once approved by an administrator.
				</p>
			) : null}
			{docError ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{docError}</p>
			) : null}

			<section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
				<h3 className="text-base font-semibold text-slate-900">Recent verifications</h3>
				{status?.verifications.length ? (
					<ul className="flex flex-col gap-2 text-xs text-slate-600">
						{status.verifications.slice(0, 5).map((entry) => (
							<li key={entry.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
								<p className="font-medium text-slate-800">
									{entry.method.toUpperCase()} · {entry.state.toUpperCase()}
								</p>
								<p>{new Date(entry.created_at).toLocaleString()}</p>
								{entry.reason ? <p>Reason: {entry.reason}</p> : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-xs text-slate-500">No verification attempts yet.</p>
				)}
			</section>
		</section>
	);
}
