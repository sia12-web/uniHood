"use client";

import { useCallback, useEffect, useState } from "react";

import PrivacyForm from "@/components/PrivacyForm";
import {
	blockUser,
	fetchPrivacySettings,
	listBlocks,
	type PrivacyPatchPayload,
	unblockUser,
	updatePrivacySettings,
} from "@/lib/privacy";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { BlockEntry, ProfilePrivacy } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function PrivacySettingsPage() {
	const [privacyState, setPrivacyState] = useState<ProfilePrivacy | null>(null);
	const [blocks, setBlocks] = useState<BlockEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [blockTarget, setBlockTarget] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const [privacy, blockRows] = await Promise.all([
					fetchPrivacySettings(DEMO_USER_ID, DEMO_CAMPUS_ID),
					listBlocks(DEMO_USER_ID, DEMO_CAMPUS_ID),
				]);
				if (!cancelled) {
					setPrivacyState(privacy);
					setBlocks(blockRows);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load privacy data");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const handlePrivacySubmit = useCallback(async (patch: PrivacyPatchPayload) => {
		const updated = await updatePrivacySettings(DEMO_USER_ID, DEMO_CAMPUS_ID, patch);
		setPrivacyState(updated);
		return updated;
	}, []);

	const handleBlock = useCallback(async () => {
		const trimmed = blockTarget.trim();
		if (!trimmed) {
			return;
		}
		const blocked = await blockUser(DEMO_USER_ID, DEMO_CAMPUS_ID, trimmed);
		setBlocks((prev) => [blocked, ...prev.filter((entry) => entry.blocked_id !== blocked.blocked_id)]);
		setBlockTarget("");
	}, [blockTarget]);

	const handleUnblock = useCallback(async (targetId: string) => {
		await unblockUser(DEMO_USER_ID, DEMO_CAMPUS_ID, targetId);
		setBlocks((prev) => prev.filter((entry) => entry.blocked_id !== targetId));
	}, []);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Privacy & Discovery</h1>
				<p className="text-sm text-slate-600">
					Tune who can find you, when you appear online, and manage blocklists for unwanted contact.
				</p>
			</header>
			{loading ? <p className="text-sm text-slate-500">Loading privacy data…</p> : null}
			{error ? <p className="text-sm text-rose-600">{error}</p> : null}
			{privacyState ? <PrivacyForm value={privacyState} onSubmit={handlePrivacySubmit} /> : null}
			<section className="flex flex-col gap-4">
				<header className="flex flex-col gap-1">
					<h2 className="text-xl font-semibold text-slate-900">Blocklist</h2>
					<p className="text-sm text-slate-600">
						Blocked users cannot send invites, messages, or view your profile. Add a user by their UUID.
					</p>
				</header>
				<div className="flex flex-wrap items-center gap-3">
					<input
						type="text"
						value={blockTarget}
						onChange={(event) => setBlockTarget(event.target.value)}
						placeholder="User ID"
						className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm shadow-sm"
					/>
					<button
						type="button"
						onClick={() => void handleBlock()}
						className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow"
					>
						Block user
					</button>
				</div>
				<div className="overflow-hidden rounded border border-slate-200">
					<table className="w-full text-left text-sm">
						<thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
							<tr>
								<th className="px-4 py-2">User</th>
								<th className="px-4 py-2">Display name</th>
								<th className="px-4 py-2">Blocked at</th>
								<th className="px-4 py-2" />
							</tr>
						</thead>
						<tbody>
							{blocks.length === 0 ? (
								<tr>
									<td className="px-4 py-3 text-slate-500" colSpan={4}>
										You haven&apos;t blocked anyone yet.
									</td>
								</tr>
							) : (
								blocks.map((entry) => (
									<tr key={entry.blocked_id} className="border-t border-slate-100">
										<td className="px-4 py-3 font-mono text-xs text-slate-700">{entry.blocked_id}</td>
										<td className="px-4 py-3 text-slate-800">{entry.blocked_display_name ?? entry.blocked_handle ?? "—"}</td>
										<td className="px-4 py-3 text-slate-600">{new Date(entry.created_at).toLocaleString()}</td>
										<td className="px-4 py-3 text-right">
											<button
												type="button"
												onClick={() => void handleUnblock(entry.blocked_id)}
												className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow"
											>
												Unblock
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</section>
		</main>
	);
}
