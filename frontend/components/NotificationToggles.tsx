"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { NotificationPatchPayload } from "@/lib/privacy";
import type { NotificationPrefs } from "@/lib/types";

type Props = {
	value: NotificationPrefs;
	onSubmit: (patch: NotificationPatchPayload) => Promise<NotificationPrefs>;
};

const TOGGLES: { key: keyof NotificationPrefs; label: string; description: string }[] = [
	{ key: "invites", label: "Invites", description: "Notify me when I receive new study invites." },
	{ key: "friends", label: "Friends", description: "Alerts for friend requests and acceptance." },
	{ key: "chat", label: "Chat", description: "Messages in direct chats and session threads." },
	{ key: "rooms", label: "Rooms", description: "Room announcements, membership updates, and mentions." },
	{ key: "activities", label: "Activities", description: "Activity reminders and streak updates." },
];

export default function NotificationToggles({ value, onSubmit }: Props) {
	const [draft, setDraft] = useState<NotificationPrefs>(value);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setDraft(value);
	}, [value]);

	const changed = useMemo(() => {
		return TOGGLES.some((toggle) => draft[toggle.key] !== value[toggle.key]);
	}, [draft, value]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!changed) {
			setMessage("No changes to apply.");
			return;
		}
		setSaving(true);
		setMessage(null);
		setError(null);
		try {
			const updated = await onSubmit({ ...draft });
			setDraft(updated);
			setMessage("Notification preferences saved.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update preferences.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<header>
				<h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
				<p className="text-sm text-slate-600">Choose which events should trigger email and push alerts.</p>
			</header>
			<div className="space-y-3">
				{TOGGLES.map((toggle) => (
					<label key={toggle.key} className="flex items-start gap-3 rounded border border-slate-200 px-4 py-3">
						<input
							type="checkbox"
							className="mt-1"
							checked={draft[toggle.key]}
							onChange={(event) => setDraft((prev) => ({ ...prev, [toggle.key]: event.target.checked }))}
						/>
						<span>
							<span className="block text-sm font-medium text-slate-900">{toggle.label}</span>
							<span className="text-xs text-slate-600">{toggle.description}</span>
						</span>
					</label>
				))}
			</div>
			<footer className="flex items-center gap-3">
				<button
					type="submit"
					disabled={saving || !changed}
					className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-indigo-300"
				>
					{saving ? "Saving…" : "Save preferences"}
				</button>
				{message ? <span className="text-xs text-emerald-600">{message}</span> : null}
				{error ? <span className="text-xs text-rose-600">{error}</span> : null}
			</footer>
		</form>
	);
}
