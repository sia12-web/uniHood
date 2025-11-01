"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { RevertPreviewRequest, RevertPreviewResponse, RevertExecuteRequest, RevertActionKind } from "@/hooks/mod/tools/use-revert";
import type { SelectorBuilderValue } from "@/components/mod/tools/selector-builder";
import { SelectorBuilder } from "@/components/mod/tools/selector-builder";

const ACTIONS: { id: RevertActionKind; label: string }[] = [
	{ id: "remove", label: "Remove" },
	{ id: "ban", label: "Ban" },
	{ id: "mute", label: "Mute" },
	{ id: "restrict_create", label: "Restrict create" },
	{ id: "shadow_hide", label: "Shadow hide" },
];

export type RevertFormProps = {
	onPreview(request: RevertPreviewRequest): Promise<void>;
	onExecute(request: RevertExecuteRequest): Promise<void>;
	previewPending: boolean;
	executePending: boolean;
	plan: RevertPreviewResponse | null;
	lastRequest: RevertPreviewRequest | null;
	canExecute: boolean;
	expiresInMs: number | null;
};

const EMPTY_SELECTOR: SelectorBuilderValue = { kind: "cases", ids: [] };

export function RevertForm({ onPreview, onExecute, previewPending, executePending, plan, lastRequest, canExecute, expiresInMs }: RevertFormProps) {
	const [selector, setSelector] = useState<SelectorBuilderValue>(EMPTY_SELECTOR);
	const [selectedActions, setSelectedActions] = useState<RevertActionKind[]>(["remove"]);
	const [reason, setReason] = useState<string>("");
	const [sampleSize, setSampleSize] = useState<string>("10");
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [confirmInput, setConfirmInput] = useState("");
	const [error, setError] = useState<string | null>(null);

	const currentRequest = useMemo<RevertPreviewRequest | null>(() => {
		if (!selectedActions.length) {
			return null;
		}
		if (selector.kind === "cases" && selector.ids.length === 0) {
			return null;
		}
		if (selector.kind === "subjects" && selector.ids.length === 0) {
			return null;
		}
		const sample = sampleSize.trim() ? Number(sampleSize) : undefined;
		if (sampleSize.trim() && (!Number.isFinite(sample) || Number(sample) <= 0)) {
			return null;
		}
		return {
			selector,
			actions: selectedActions,
			reason_note: reason.trim() || undefined,
			sample_size: sample,
		};
	}, [selector, selectedActions, reason, sampleSize]);

	const requestMatchesPlan = useMemo(() => {
		if (!currentRequest || !lastRequest) return false;
		return JSON.stringify(currentRequest) === JSON.stringify(lastRequest);
	}, [currentRequest, lastRequest]);

	function toggleAction(id: RevertActionKind) {
		setSelectedActions((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
	}

	async function handlePreview(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setConfirmVisible(false);
		setConfirmInput("");
		if (!currentRequest) {
			setError("Select actions and provide valid selector inputs");
			return;
		}
		await onPreview(currentRequest);
	}

	async function handleExecute() {
		setError(null);
		if (!plan || !lastRequest) {
			setError("Preview results before executing");
			return;
		}
		if (!canExecute) {
			setError("Preview expired — run preview again");
			return;
		}
		if (!requestMatchesPlan) {
			setError("Form changed since preview. Re-run preview to refresh token.");
			return;
		}
		if (!confirmVisible) {
			setConfirmVisible(true);
			return;
		}
		if (confirmInput.trim().toUpperCase() !== "RUN") {
			setError("Type RUN to confirm execution");
			return;
		}
		await onExecute({ ...lastRequest, token: plan.token });
		setConfirmInput("");
		setConfirmVisible(false);
	}

	return (
		<form onSubmit={handlePreview} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Batch revert</h2>
				<p className="text-sm text-slate-600">Roll back prior enforcement decisions. Only staff.admin accounts may run this tool.</p>
			</header>

			<section className="space-y-3">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</h3>
				<div className="flex flex-wrap gap-3">
					{ACTIONS.map((action) => (
						<label key={action.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300">
							<input
								type="checkbox"
								checked={selectedActions.includes(action.id)}
								onChange={() => toggleAction(action.id)}
							/>
							{action.label}
						</label>
					))}
				</div>
			</section>

			<SelectorBuilder value={selector} onChange={setSelector} allowUserSubjects={false} />

			<div className="grid gap-4 md:grid-cols-3">
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Sample size (optional)</span>
					<input
						type="number"
						value={sampleSize}
						onChange={(event) => setSampleSize(event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						min={1}
					/>
				</label>
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
					<span>Reason note (optional)</span>
					<input
						type="text"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="Why is this revert needed?"
					/>
				</label>
			</div>

			{error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
			{plan && canExecute ? (
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status" aria-live="polite">
					Preview ready. Execute within {Math.max(0, Math.round((expiresInMs ?? 0) / 1000))} seconds.
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="submit"
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
					disabled={previewPending}
				>
					{previewPending ? "Previewing…" : "Preview"}
				</button>
				<button
					type="button"
					onClick={handleExecute}
					className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:text-rose-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
					disabled={executePending || !plan}
				>
					{executePending ? "Executing…" : "Execute"}
				</button>
			</div>

			{confirmVisible ? (
				<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
					<p className="text-sm font-semibold text-rose-700">Type RUN to confirm execution.</p>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<label htmlFor="revert-run-confirm" className="sr-only">
							Type RUN to confirm execution
						</label>
						<input
							id="revert-run-confirm"
							type="text"
							value={confirmInput}
							onChange={(event) => setConfirmInput(event.target.value)}
							className="w-40 rounded-lg border border-rose-200 px-3 py-2 text-sm"
						/>
						<button type="button" onClick={handleExecute} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">
							Confirm run
						</button>
						<button type="button" onClick={() => { setConfirmVisible(false); setConfirmInput(""); }} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300">
							Cancel
						</button>
					</div>
				</div>
			) : null}

			{plan ? (
				<section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<header className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
						<strong>Preview sample</strong>
						<span>Total matched actions: {plan.total}</span>
					</header>
					<ul className="space-y-2 text-sm text-slate-700">
						{plan.sample.map((item, index) => (
							<li key={`${item.target_id}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-mono text-xs uppercase text-slate-500">{item.target_id}</span>
									<span className="text-xs text-slate-500">{item.action}</span>
								</div>
								{item.performed_by ? <p className="text-xs text-slate-500">By {item.performed_by}</p> : null}
								{item.performed_at ? <p className="text-xs text-slate-400">Applied {new Date(item.performed_at).toLocaleString()}</p> : null}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</form>
	);
}
