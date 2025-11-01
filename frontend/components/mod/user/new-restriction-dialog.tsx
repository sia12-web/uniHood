"use client";

import { useEffect, useMemo, useState } from "react";

import type { RestrictionMode } from "@/hooks/mod/user/use-restrictions";

export type RestrictionPreset = {
	id: string;
	label: string;
	mode: RestrictionMode;
	scope: string;
	ttlSeconds: number;
	reason?: string;
};

export type NewRestrictionDialogProps = {
	open: boolean;
	onDismiss: () => void;
	onSubmit: (payload: { scope: string; mode: RestrictionMode; ttlSeconds: number; reason: string }) => Promise<void> | void;
	presets?: RestrictionPreset[];
	loading?: boolean;
	title?: string;
};

const DEFAULT_PRESETS: RestrictionPreset[] = [
	{ id: "cooldown-15", label: "Comment cooldown — 15 minutes", mode: "cooldown", scope: "comment", ttlSeconds: 15 * 60 },
	{ id: "shadow-24", label: "Shadow restrict — 24 hours", mode: "shadow_restrict", scope: "global", ttlSeconds: 24 * 60 * 60 },
	{ id: "captcha-24", label: "Captcha gate — 24 hours", mode: "captcha", scope: "global", ttlSeconds: 24 * 60 * 60 },
];

export function NewRestrictionDialog({ open, onDismiss, onSubmit, presets, loading, title }: NewRestrictionDialogProps) {
	const options = useMemo(() => presets ?? DEFAULT_PRESETS, [presets]);
	const [presetId, setPresetId] = useState<string>(options[0]?.id ?? "");
	const [mode, setMode] = useState<RestrictionMode>(options[0]?.mode ?? "cooldown");
	const [scope, setScope] = useState<string>(options[0]?.scope ?? "global");
	const [ttl, setTtl] = useState<number>(options[0]?.ttlSeconds ?? 0);
	const [reason, setReason] = useState<string>(options[0]?.reason ?? "");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (options.length && !options.find((item) => item.id === presetId)) {
			setPresetId(options[0].id);
		}
	}, [options, presetId]);

	useEffect(() => {
		if (!open) return;
		const selected = options.find((item) => item.id === presetId);
		if (selected) {
			setMode(selected.mode);
			setScope(selected.scope);
			setTtl(selected.ttlSeconds);
			setReason(selected.reason ?? "");
		}
	}, [open, presetId, options]);

	if (!open) {
		return null;
	}

	const busy = Boolean(loading);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="restriction-dialog-title">
			<div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 id="restriction-dialog-title" className="text-lg font-semibold text-slate-900">
							{title ?? "Apply restriction"}
						</h2>
						<p className="text-sm text-slate-500">Choose a preset or custom values to apply a new restriction.</p>
					</div>
					<button
						type="button"
						onClick={onDismiss}
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
					>
						Close
					</button>
				</div>
				<form
					className="mt-5 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						setError(null);
						if (!scope.trim() || !mode.trim() || !ttl) {
							setError("Fill out all required fields.");
							return;
						}
						try {
							await onSubmit({
								scope: scope.trim(),
								mode,
								ttlSeconds: ttl,
								reason: reason.trim(),
							});
							onDismiss();
						} catch (submissionError) {
							setError(
								submissionError instanceof Error ? submissionError.message : "Unable to apply restriction",
							);
						}
					}}
				>
					<label className="block space-y-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preset</span>
						<select
							value={presetId}
							className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
							onChange={(event) => setPresetId(event.target.value)}
						>
							{options.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
					</label>
					<div className="grid gap-3 md:grid-cols-2">
						<label className="space-y-2">
							<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</span>
							<input
								type="text"
								value={mode}
								onChange={(event) => setMode(event.target.value as RestrictionMode)}
								className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
								required
							/>
						</label>
						<label className="space-y-2">
							<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scope</span>
							<input
								type="text"
								value={scope}
								onChange={(event) => setScope(event.target.value)}
								className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
								required
							/>
						</label>
					</div>
					<label className="block space-y-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration (seconds)</span>
						<input
							type="number"
							value={ttl}
							min={60}
							step={60}
							onChange={(event) => setTtl(Number(event.target.value))}
							className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
							required
						/>
					</label>
					<label className="block space-y-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</span>
						<textarea
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							className="h-28 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
							required
						/>
					</label>
					{error ? <p className="text-sm text-rose-600">{error}</p> : null}
					<footer className="flex items-center justify-end gap-3">
						<button
							type="button"
							onClick={onDismiss}
							className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
							disabled={busy}
						>
							{busy ? "Applying…" : "Apply restriction"}
						</button>
					</footer>
				</form>
			</div>
		</div>
	);
}
