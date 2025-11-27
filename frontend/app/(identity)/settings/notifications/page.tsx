"use client";

import { useCallback, useEffect, useState } from "react";

import NotificationToggles from "@/components/NotificationToggles";
import {
	fetchNotificationPrefs,
	type NotificationPatchPayload,
	updateNotificationPrefs,
} from "@/lib/privacy";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { NotificationPrefs } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function NotificationSettingsPage() {
	const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const response = await fetchNotificationPrefs(DEMO_USER_ID, DEMO_CAMPUS_ID);
				if (!cancelled) {
					setPrefs(response);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load preferences");
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

	const handleSubmit = useCallback(async (patch: NotificationPatchPayload) => {
		const updated = await updateNotificationPrefs(DEMO_USER_ID, DEMO_CAMPUS_ID, patch);
		setPrefs(updated);
		return updated;
	}, []);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold text-slate-900">Notification Settings</h1>
				<p className="text-sm text-slate-600">
					Decide which alerts Campus should send for invites, friends, chat, rooms, and activities.
				</p>
			</header>
			{loading ? <p className="text-sm text-slate-500">Loading notification preferences…</p> : null}
			{error ? <p className="text-sm text-rose-600">{error}</p> : null}
			{prefs ? <NotificationToggles value={prefs} onSubmit={handleSubmit} /> : null}
		</main>
	);
}
