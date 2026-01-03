"use client";

import EmailChangeFlow from "@/components/EmailChangeFlow";
import PhoneNumberForm from "@/components/PhoneNumberForm";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
	fetchAuditLog,
	fetchDeletionStatus,
	fetchExportDownload,
	fetchExportStatus,
	forceDeleteAccount,
	requestExportJob,
	type AuditLogPage,
} from "@/lib/privacy";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import type { DeletionStatus, ExportStatus } from "@/lib/types";

function formatDeletionError(message: string): string {
	if (message === "delete_request_rate") {
		return "A deletion email was already requested within the last day. Check your inbox for the token or wait 24 hours.";
	}
	if (message === "delete_token_invalid") {
		return "The deletion token is invalid or expired. Request a new one from this page.";
	}
	return message;
}

export default function AccountSettingsPage() {
	const router = useRouter();
	const [authUser, setAuthUser] = useState<AuthUser | null>(null);
	const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportLoading, setExportLoading] = useState(false);

	const [deletionStatus, setDeletionStatus] = useState<DeletionStatus | null>(null);
	const [deletionError, setDeletionError] = useState<string | null>(null);
	const [deletionLoading, setDeletionLoading] = useState(false);
	const [deletionSuccess, setDeletionSuccess] = useState<string | null>(null);

	const [auditPage, setAuditPage] = useState<AuditLogPage | null>(null);
	const [auditLoading, setAuditLoading] = useState(false);
	const [auditError, setAuditError] = useState<string | null>(null);

	useEffect(() => {
		const hydrate = () => setAuthUser(readAuthUser());
		hydrate();
		return onAuthChange(hydrate);
	}, []);

	const userId = authUser?.userId ?? null;
	const campusId = authUser?.campusId ?? null;

	useEffect(() => {
		if (!userId) {
			return;
		}
		const uid = userId;
		const cid = campusId ?? null;
		let cancelled = false;
		async function load() {
			setExportLoading(true);
			setDeletionLoading(true);
			setAuditLoading(true);
			setExportError(null);
			setDeletionError(null);
			setAuditError(null);
			const [exportResult, deletionResult, auditResult] = await Promise.allSettled([
				fetchExportStatus(uid, cid),
				fetchDeletionStatus(uid, cid),
				fetchAuditLog(uid, cid, { limit: 20 }),
			]);
			if (cancelled) {
				return;
			}
			if (exportResult.status === "fulfilled") {
				setExportStatus(exportResult.value);
			} else {
				const message = exportResult.reason instanceof Error ? exportResult.reason.message : "Failed to load export status";
				if (message === "export_not_found") {
					setExportStatus(null);
				} else {
					setExportError(message);
				}
			}
			if (deletionResult.status === "fulfilled") {
				setDeletionStatus(deletionResult.value);
			} else {
				const message = deletionResult.reason instanceof Error ? deletionResult.reason.message : "Failed to load deletion status";
				if (message === "delete_not_requested") {
					setDeletionStatus(null);
				} else {
					setDeletionError(message);
				}
			}
			if (auditResult.status === "fulfilled") {
				setAuditPage(auditResult.value);
			} else {
				const message = auditResult.reason instanceof Error ? auditResult.reason.message : "Failed to load audit log";
				setAuditError(message);
			}
			setExportLoading(false);
			setDeletionLoading(false);
			setAuditLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [userId, campusId]);

	const handleExportRequest = useCallback(async () => {
		if (!userId) return;
		const uid = userId;
		const cid = campusId ?? null;
		setExportLoading(true);
		setExportError(null);
		try {
			const status = await requestExportJob(uid, cid);
			setExportStatus(status);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : "Export request failed");
		} finally {
			setExportLoading(false);
		}
	}, [userId, campusId]);

	const handleExportRefresh = useCallback(async () => {
		if (!userId) return;
		const uid = userId;
		const cid = campusId ?? null;
		setExportLoading(true);
		setExportError(null);
		try {
			const status = await fetchExportStatus(uid, cid);
			setExportStatus(status);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : "Failed to fetch status");
		} finally {
			setExportLoading(false);
		}
	}, [userId, campusId]);

	const handleExportDownload = useCallback(async () => {
		if (!userId) return;
		const uid = userId;
		const cid = campusId ?? null;
		try {
			const status = await fetchExportDownload(uid, cid);
			setExportStatus(status);
			if (status.download_url) {
				window.open(status.download_url, "_blank");
			}
		} catch (err) {
			setExportError(err instanceof Error ? err.message : "Download not ready");
		}
	}, [userId, campusId]);

	const handleForceDelete = useCallback(async () => {
		if (!userId) return;
		setDeletionLoading(true);
		setDeletionError(null);
		setDeletionSuccess(null);
		try {
			const status = await forceDeleteAccount(userId, campusId ?? null);
			setDeletionStatus(status);
			setDeletionSuccess("Your account has been deleted and sessions were revoked.");
			clearAuthSnapshot();
			router.push("/");
		} catch (err) {
			const raw = err instanceof Error ? err.message : "Deletion failed";
			setDeletionError(formatDeletionError(raw));
		} finally {
			setDeletionLoading(false);
		}
	}, [userId, campusId, router]);

	const handleAuditLoadMore = useCallback(async () => {
		if (!auditPage?.cursor || !userId) {
			return;
		}
		const uid = userId;
		const cid = campusId ?? null;
		setAuditLoading(true);
		setAuditError(null);
		try {
			const nextPage = await fetchAuditLog(uid, cid, {
				limit: 20,
				cursor: auditPage.cursor,
			});
			setAuditPage((prev) =>
				prev
					? {
						items: [...prev.items, ...nextPage.items],
						cursor: nextPage.cursor,
					}
					: nextPage,
			);
		} catch (err) {
			setAuditError(err instanceof Error ? err.message : "Failed to extend audit log");
		} finally {
			setAuditLoading(false);
		}
	}, [auditPage, userId, campusId]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Account Management</h1>
				<p className="text-sm text-slate-600">
					Export your data, start deletion workflows, and review the audit history tied to your identity actions.
				</p>
			</header>
			{userId ? (
				<div className="grid gap-6 lg:grid-cols-2">
					<EmailChangeFlow userId={userId} campusId={campusId} />
					<PhoneNumberForm userId={userId} campusId={campusId} />
				</div>
			) : (
				<div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					Sign in again to manage your email and phone number settings.
				</div>
			)}

			<section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-6 shadow-sm">
				<header className="flex flex-col gap-1">
					<h2 className="text-xl font-semibold text-slate-900">Data export</h2>
					<p className="text-sm text-slate-600">
						Generate a 24-hour download link containing your profile, friendships, rooms, and activity data.
					</p>
				</header>
				{exportError ? <p className="text-sm text-rose-600">{exportError}</p> : null}
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => void handleExportRequest()}
						className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow disabled:bg-indigo-300"
						disabled={exportLoading}
					>
						{exportLoading ? "Requesting…" : "Request export"}
					</button>
					<button
						type="button"
						onClick={() => void handleExportRefresh()}
						className="rounded bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow"
						disabled={exportLoading}
					>
						Refresh status
					</button>
					<button
						type="button"
						onClick={() => void handleExportDownload()}
						className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow disabled:bg-emerald-300"
						disabled={exportStatus?.status !== "ready"}
					>
						Download archive
					</button>
				</div>
				{exportStatus ? (
					<dl className="grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-3">
						<div>
							<dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
							<dd className="font-medium">{exportStatus.status}</dd>
						</div>
						<div>
							<dt className="text-xs uppercase tracking-wide text-slate-500">Requested</dt>
							<dd>{new Date(exportStatus.requested_at).toLocaleString()}</dd>
						</div>
						<div>
							<dt className="text-xs uppercase tracking-wide text-slate-500">Completed</dt>
							<dd>{exportStatus.completed_at ? new Date(exportStatus.completed_at).toLocaleString() : "Pending"}</dd>
						</div>
					</dl>
				) : null}
			</section>

			<section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-6 shadow-sm">
				<header className="flex flex-col gap-1">
					<h2 className="text-xl font-semibold text-slate-900">Account deletion</h2>
					<p className="text-sm text-slate-600">
						Deleting...will anonymize your account, revoke sessions, and remove your sign-in credentials immediately.
					</p>
				</header>
				{deletionError ? <p className="text-sm text-rose-600">{deletionError}</p> : null}
				{deletionSuccess ? <p className="text-sm text-emerald-600">{deletionSuccess}</p> : null}
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => void handleForceDelete()}
						className="rounded bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow disabled:bg-rose-300"
						disabled={deletionLoading}
					>
						{deletionLoading ? "Deleting..." : "Delete account now"}
					</button>
				</div>
				<div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
					This action is immediate and cannot be undone.
				</div>
				{deletionStatus ? (
					<dl className="grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-3">
						<div>
							<dt className="text-xs uppercase tracking-wide text-slate-500">Requested</dt>
							<dd>{new Date(deletionStatus.requested_at).toLocaleString()}</dd>
						</div>
						<div>
							<dt className="text-xs uppercase tracking-wide text-slate-500">Confirmed</dt>
							<dd>
								{deletionStatus.confirmed_at
									? new Date(deletionStatus.confirmed_at).toLocaleString()
									: "Awaiting confirmation"}
							</dd>
						</div>
						<div>
							<dt className="text-xs uppercase tracking-wide text-slate-500">Purged</dt>
							<dd>{deletionStatus.purged_at ? new Date(deletionStatus.purged_at).toLocaleString() : "Scheduled"}</dd>
						</div>
					</dl>
				) : null}
			</section>

			<section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-6 shadow-sm">
				<header className="flex flex-col gap-1">
					<h2 className="text-xl font-semibold text-slate-900">Audit log</h2>
					<p className="text-sm text-slate-600">
						Events recorded for logins, sessions, privacy updates, exports, deletions, and security actions.
					</p>
				</header>
				{auditError ? <p className="text-sm text-rose-600">{auditError}</p> : null}
				<div className="overflow-hidden rounded border border-slate-200">
					<table className="w-full text-left text-sm">
						<thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
							<tr>
								<th className="px-4 py-2">Time</th>
								<th className="px-4 py-2">Event</th>
								<th className="px-4 py-2">Metadata</th>
							</tr>
						</thead>
						<tbody>
							{auditPage?.items?.length ? (
								auditPage.items.map((item) => (
									<tr key={item.id} className="border-t border-slate-100">
										<td className="px-4 py-3 text-slate-600">{new Date(item.created_at).toLocaleString()}</td>
										<td className="px-4 py-3 font-medium text-slate-800">{item.event}</td>
										<td className="px-4 py-3 text-xs text-slate-600">
											{Object.keys(item.meta).length === 0
												? "—"
												: Object.entries(item.meta)
													.map(([key, value]) => `${key}: ${value}`)
													.join(", ")}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td className="px-4 py-3 text-slate-500" colSpan={3}>
										No audit events recorded yet.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="flex items-center justify-between">
					<p className="text-xs text-slate-500">
						Showing {auditPage?.items.length ?? 0} events.
						{auditLoading ? " Loading more…" : null}
					</p>
					<button
						type="button"
						onClick={() => void handleAuditLoadMore()}
						disabled={!auditPage?.cursor || auditLoading}
						className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow disabled:cursor-not-allowed disabled:opacity-50"
					>
						Load more
					</button>
				</div>
			</section>
		</main>
	);
}










