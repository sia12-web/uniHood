"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { PrivacyPatchPayload } from "@/lib/privacy";
import type { ProfilePrivacy } from "@/lib/types";

type Props = {
	value: ProfilePrivacy;
	onSubmit: (patch: PrivacyPatchPayload) => Promise<ProfilePrivacy>;
};

const VISIBILITY_OPTIONS: { value: ProfilePrivacy["visibility"]; label: string; description: string }[] = [
	{
		value: "everyone",
		label: "Everyone",
		description: "Anyone at your campus can discover your profile in search and rooms.",
	},
	{
		value: "friends",
		label: "Friends",
		description: "Only friends can view your profile details and recent activity.",
	},
	{
		value: "none",
		label: "No one",
		description: "Hide your profile from search and disallow discovery.",
	},
];

export default function PrivacyForm({ value, onSubmit }: Props) {
	const [draft, setDraft] = useState<ProfilePrivacy>(value);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setDraft(value);
	}, [value]);

	const pendingChanges = useMemo(() => {
		return (
			draft.visibility !== value.visibility ||
			draft.ghost_mode !== value.ghost_mode ||
			draft.discoverable_by_email !== value.discoverable_by_email ||
			draft.show_online_status !== value.show_online_status ||
			draft.share_activity !== value.share_activity
		);
	}, [draft, value]);

		async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!pendingChanges) {
			setMessage("No changes to apply.");
			return;
		}
		setSaving(true);
		setMessage(null);
		setError(null);
		try {
			const updated = await onSubmit({ ...draft });
			setDraft(updated);
			setMessage("Privacy settings updated.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update privacy settings.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<section className="space-y-3">
				<header>
					<h2 className="text-xl font-semibold text-slate-900">Profile visibility</h2>
					<p className="text-sm text-slate-600">Control who can find and view your profile across Campus.</p>
				</header>
				<div className="space-y-3">
					{VISIBILITY_OPTIONS.map((option) => {
						const selected = draft.visibility === option.value;
						return (
							<label
								key={option.value}
								className={`flex cursor-pointer rounded border px-4 py-3 transition hover:border-slate-400 ${
									selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200"
								}`}
							>
								<input
									type="radio"
									name="visibility"
									value={option.value}
									className="mt-1"
									checked={selected}
									onChange={() => setDraft((prev) => ({ ...prev, visibility: option.value }))}
								/>
								<div className="ml-3">
									<p className="text-sm font-medium text-slate-900">{option.label}</p>
									<p className="text-xs text-slate-600">{option.description}</p>
								</div>
							</label>
						);
					})}
				</div>
			</section>

			<section className="space-y-3">
				<header>
					<h2 className="text-xl font-semibold text-slate-900">Presence & discovery</h2>
					<p className="text-sm text-slate-600">Toggle how your status and activity appear to other students.</p>
				</header>
				<fieldset className="space-y-2">
					<label className="flex items-center gap-3 text-sm text-slate-700">
						<input
							type="checkbox"
							checked={draft.ghost_mode}
							onChange={(event) => setDraft((prev) => ({ ...prev, ghost_mode: event.target.checked }))}
						/>
						Hide my presence (ghost mode)
					</label>
					<label className="flex items-center gap-3 text-sm text-slate-700">
						<input
							type="checkbox"
							checked={draft.discoverable_by_email}
							onChange={(event) =>
								setDraft((prev) => ({ ...prev, discoverable_by_email: event.target.checked }))
							}
						/>
						Allow classmates to discover me via email search
					</label>
					<label className="flex items-center gap-3 text-sm text-slate-700">
						<input
							type="checkbox"
							checked={draft.show_online_status}
							onChange={(event) => setDraft((prev) => ({ ...prev, show_online_status: event.target.checked }))}
						/>
						Show when I&apos;m online
					</label>
					<label className="flex items-center gap-3 text-sm text-slate-700">
						<input
							type="checkbox"
							checked={draft.share_activity}
							onChange={(event) => setDraft((prev) => ({ ...prev, share_activity: event.target.checked }))}
						/>
						Share my study activity with friends
					</label>
				</fieldset>
			</section>

			<footer className="flex items-center gap-3">
				<button
					type="submit"
					disabled={saving || !pendingChanges}
					className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-indigo-300"
				>
					{saving ? "Saving…" : "Save changes"}
				</button>
				{message ? <span className="text-xs text-emerald-600">{message}</span> : null}
				{error ? <span className="text-xs text-rose-600">{error}</span> : null}
			</footer>
		</form>
	);
}
