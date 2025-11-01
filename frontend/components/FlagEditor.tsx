"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { FeatureFlagKind, FeatureFlagRow } from "@/lib/types";

interface FlagEditorProps {
	flags: FeatureFlagRow[];
	onSave: (payload: { key: string; kind: FeatureFlagKind; description: string; payload: Record<string, unknown> }) => Promise<void> | void;
	onDelete?: (key: string) => Promise<void> | void;
	busy?: boolean;
	selectedKey?: string | null;
	onSelect?: (key: string | null) => void;
}

type Draft = {
	key: string;
	kind: FeatureFlagKind;
	description: string;
	payloadText: string;
};

const EMPTY_DRAFT: Draft = {
	key: "",
	kind: "bool",
	description: "",
	payloadText: "{}",
};

export default function FlagEditor({ flags, onSave, onDelete, busy = false, selectedKey: selectedKeyProp, onSelect }: FlagEditorProps) {
	const [internalSelectedKey, setInternalSelectedKey] = useState<string | null>(flags[0]?.key ?? null);
	const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const selectedKey = selectedKeyProp ?? internalSelectedKey;

	useEffect(() => {
		if (selectedKeyProp === undefined && !internalSelectedKey && flags[0]) {
			setInternalSelectedKey(flags[0].key);
		}
	}, [flags, internalSelectedKey, selectedKeyProp]);

	useEffect(() => {
		if (selectedKeyProp === undefined) {
			if (selectedKey && !flags.some((flag) => flag.key === selectedKey)) {
				setInternalSelectedKey(flags[0]?.key ?? null);
			}
			if (!selectedKey && flags[0]) {
				setInternalSelectedKey(flags[0].key);
			}
			if (flags.length === 0 && internalSelectedKey) {
				setInternalSelectedKey(null);
			}
		}
	}, [flags, internalSelectedKey, selectedKey, selectedKeyProp]);

	const setSelectedKey = (key: string | null) => {
		if (onSelect) {
			onSelect(key);
		} else {
			setInternalSelectedKey(key);
		}
	};

	const selectedFlag = useMemo(() => flags.find((flag) => flag.key === selectedKey) ?? null, [flags, selectedKey]);

	useEffect(() => {
		if (selectedFlag) {
			setDraft({
				key: selectedFlag.key,
				kind: selectedFlag.kind,
				description: selectedFlag.description ?? "",
				payloadText: JSON.stringify(selectedFlag.payload ?? {}, null, 2),
			});
		} else {
			setDraft(EMPTY_DRAFT);
		}
	}, [selectedFlag]);

	const handleNew = () => {
		setSelectedKey(null);
		setDraft(EMPTY_DRAFT);
		setError(null);
		setSuccess(null);
	};

	const handleSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setSuccess(null);
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(draft.payloadText || "{}");
		} catch {
			setError("Payload must be valid JSON");
			return;
		}
		if (!draft.key.trim()) {
			setError("Flag key is required");
			return;
		}
		try {
			await onSave({
				key: draft.key.trim(),
				kind: draft.kind,
				description: draft.description.trim(),
				payload,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save flag");
			return;
		}
		setSuccess("Flag saved successfully");
		setSelectedKey(draft.key.trim());
	};

	const handleDelete = async () => {
		if (!draft.key || !onDelete) {
			return;
		}
		setError(null);
		setSuccess(null);
		try {
			await onDelete(draft.key);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete flag");
			return;
		}
	setSelectedKey(null);
		setDraft(EMPTY_DRAFT);
		setSuccess("Flag deleted");
	};

	return (
		<div className="grid gap-6 lg:grid-cols-3">
			<section className="lg:col-span-1">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Feature flags</h2>
					<button
						type="button"
						onClick={handleNew}
						className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
					>
						New flag
					</button>
				</div>
				<div className="mt-3 space-y-2">
					{flags.length === 0 ? (
						<p className="text-sm text-slate-500">No flags configured.</p>
					) : (
						<ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
							{flags.map((flag) => {
								const isActive = flag.key === selectedFlag?.key;
								return (
									<li key={flag.key}>
										<button
											type="button"
											onClick={() => setSelectedKey(flag.key)}
											className={`flex w-full justify-between px-3 py-2 text-left text-sm ${isActive ? "bg-amber-50" : "hover:bg-slate-50"}`}
										>
											<span className="font-medium text-slate-800">{flag.key}</span>
											<span className="text-xs uppercase tracking-wide text-slate-500">{flag.kind}</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</section>
			<section className="lg:col-span-2">
				{error ? <p className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
				{success ? <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
				<form onSubmit={handleSave} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Key</span>
							<input
								type="text"
								value={draft.key}
								onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))}
								className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
								required
								placeholder="identity.experiments.beta"
							/>
						</label>
						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Kind</span>
							<select
								value={draft.kind}
								onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as FeatureFlagKind }))}
								className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
							>
								<option value="bool">Boolean</option>
								<option value="percentage">Percentage</option>
								<option value="allowlist">Allow list</option>
								<option value="experiment">Experiment</option>
							</select>
						</label>
					</div>
					<label className="block space-y-1 text-sm">
						<span className="font-medium text-slate-700">Description</span>
						<input
							type="text"
							value={draft.description}
							onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
							className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
							placeholder="Explain the rollout"
						/>
					</label>
					<label className="block space-y-1 text-sm">
						<span className="font-medium text-slate-700">Payload (JSON)</span>
						<textarea
							rows={10}
							value={draft.payloadText}
							onChange={(event) => setDraft((current) => ({ ...current, payloadText: event.target.value }))}
							className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
						/>
					</label>
					<div className="flex items-center justify-between">
						<div className="space-x-2">
							<button
								type="submit"
								disabled={busy}
								className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
							>
								{busy ? "Saving…" : "Save flag"}
							</button>
							{selectedFlag && onDelete ? (
								<button
									type="button"
									disabled={busy}
									onClick={() => void handleDelete()}
									className="rounded bg-rose-100 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-200 disabled:opacity-50"
								>
									Delete
								</button>
							) : null}
						</div>
						{selectedFlag ? <span className="text-xs text-slate-500">Last payload size {JSON.stringify(selectedFlag.payload ?? {}).length} bytes</span> : null}
					</div>
				</form>
			</section>
		</div>
	);
}
