"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { UnshadowPreviewRequest, UnshadowPreviewResponse, UnshadowExecuteRequest } from "@/hooks/mod/tools/use-unshadow";

export type UnshadowFormProps = {
	onPreview(request: UnshadowPreviewRequest): Promise<void>;
	onExecute(request: UnshadowExecuteRequest): Promise<void>;
	previewPending: boolean;
	executePending: boolean;
	plan: UnshadowPreviewResponse | null;
	lastRequest: UnshadowPreviewRequest | null;
	canExecute: boolean;
	expiresInMs: number | null;
	missingCampus: boolean;
};

export function UnshadowForm({ onPreview, onExecute, previewPending, executePending, plan, lastRequest, canExecute, expiresInMs, missingCampus }: UnshadowFormProps) {
	const [subjectType, setSubjectType] = useState<"post" | "comment">("post");
	const [campus, setCampus] = useState<string>("");
	const [actorId, setActorId] = useState<string>("");
	const [start, setStart] = useState<string>("");
	const [end, setEnd] = useState<string>("");
	const [sampleSize, setSampleSize] = useState<string>("20");
	const [reason, setReason] = useState<string>("");
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [confirmInput, setConfirmInput] = useState("");
	const [error, setError] = useState<string | null>(null);

	const currentRequest = useMemo<UnshadowPreviewRequest | null>(() => {
		const sample = sampleSize.trim() ? Number(sampleSize) : undefined;
		if (sampleSize.trim() && (!Number.isFinite(sample) || Number(sample) <= 0)) {
			return null;
		}
		return {
			filter: {
				subject_type: subjectType,
				campus: campus || undefined,
				actor_id: actorId || undefined,
				created_after: start || undefined,
				created_before: end || undefined,
				shadow_only: true,
			},
			sample_size: sample,
			reason_note: reason.trim() || undefined,
		};
	}, [subjectType, campus, actorId, start, end, sampleSize, reason]);

	const requestMatchesPlan = useMemo(() => {
		if (!currentRequest || !lastRequest) return false;
		return JSON.stringify(currentRequest) === JSON.stringify(lastRequest);
	}, [currentRequest, lastRequest]);

	async function handlePreview(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setConfirmVisible(false);
		setConfirmInput("");
		if (!currentRequest) {
			setError("Provide valid filters and sample size");
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
			setError("Filters changed since preview. Re-run preview to refresh token.");
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
		setConfirmVisible(false);
		setConfirmInput("");
	}

	return (
		<form onSubmit={handlePreview} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Batch unshadow</h2>
				<p className="text-sm text-slate-600">Lift shadow restrictions for matching content. Preview first; execution runs asynchronously.</p>
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Subject type</span>
					<select
						value={subjectType}
						onChange={(event) => setSubjectType(event.target.value as typeof subjectType)}
						className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
					>
						<option value="post">Post</option>
						<option value="comment">Comment</option>
					</select>
				</label>
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Campus</span>
					<input
						type="text"
						value={campus}
						onChange={(event) => setCampus(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="north-campus"
					/>
				</label>
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Actor (optional)</span>
					<input
						type="text"
						value={actorId}
						onChange={(event) => setActorId(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="mod-123"
					/>
				</label>
				<div className="grid gap-3">
					<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created range</span>
					<div className="grid grid-cols-2 gap-2">
						<label className="space-y-1 text-xs text-slate-500">
							<span className="sr-only">Created after</span>
							<input
								type="datetime-local"
								value={start}
								onChange={(event) => setStart(event.target.value)}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
							/>
						</label>
						<label className="space-y-1 text-xs text-slate-500">
							<span className="sr-only">Created before</span>
							<input
								type="datetime-local"
								value={end}
								onChange={(event) => setEnd(event.target.value)}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
							/>
						</label>
					</div>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Sample size (optional)</span>
					<input
						type="number"
						value={sampleSize}
						onChange={(event) => setSampleSize(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						min={1}
					/>
				</label>
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
					<span>Reason note (optional)</span>
					<input
						type="text"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="Explain why this unshadow run is needed"
					/>
				</label>
			</div>

			{missingCampus ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
					Campus filter not set. Large unscoped runs require Director approval.
				</div>
			) : null}
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
						<label htmlFor="unshadow-run-confirm" className="sr-only">
							Type RUN to confirm execution
						</label>
						<input
							id="unshadow-run-confirm"
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
						<span>Total matches: {plan.total}</span>
					</header>
					<ul className="space-y-2 text-sm text-slate-700">
						{plan.sample.map((item) => (
							<li key={item.target_id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-mono text-xs uppercase text-slate-500">{item.target_id}</span>
									<span className="text-xs text-slate-500">{item.campus ?? "—"}</span>
								</div>
								{item.shadow_reason ? <p className="text-xs text-slate-500">Reason: {item.shadow_reason}</p> : null}
								{item.acted_at ? <p className="text-xs text-slate-400">Shadowed {new Date(item.acted_at).toLocaleString()}</p> : null}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</form>
	);
}
