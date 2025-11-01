"use client";

import { useState } from "react";

import { RevertorPreview } from "@/components/mod/case-appeal/revertor-preview";
import type { ResolveAppealRequest } from "@/hooks/mod/appeal/use-resolve-appeal";

export type ResolveDialogProps = {
	open: boolean;
	onDismiss: () => void;
	onSubmit: (payload: Pick<ResolveAppealRequest, "status" | "note">) => Promise<void> | void;
	loading?: boolean;
	revertors?: string[];
};

export function ResolveAppealDialog({ open, onDismiss, onSubmit, loading, revertors }: ResolveDialogProps) {
	const [status, setStatus] = useState<ResolveAppealRequest["status"] | "">("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (!open) return null;

	const busy = Boolean(loading);
	const disabled = !status || busy;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="resolve-appeal-heading">
			<div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
				<header className="flex items-start justify-between gap-4">
					<div>
						<h2 id="resolve-appeal-heading" className="text-lg font-semibold text-slate-900">
							Finalize appeal
						</h2>
						<p className="text-sm text-slate-500">Accepting will restore impacted enforcement; rejecting keeps restrictions in place.</p>
					</div>
					<button
						type="button"
						onClick={onDismiss}
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
					>
						Close
					</button>
				</header>
				<form
					className="mt-5 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (!status) {
							setError("Choose a resolution");
							return;
						}
						setError(null);
						try {
							await onSubmit({ status, note: note.trim() || undefined });
							onDismiss();
						} catch (submissionError) {
							setError(submissionError instanceof Error ? submissionError.message : "Unable to resolve appeal");
						}
					}}
				>
					<fieldset className="space-y-2" role="radiogroup" aria-label="Resolution">
						<legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resolution</legend>
						<label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
							<input
								type="radio"
								name="appeal-status"
								value="accepted"
								checked={status === "accepted"}
								onChange={() => setStatus("accepted")}
							/>
							<span>
								<strong className="text-slate-900">Accept appeal</strong>
								<p className="text-xs text-slate-500">Restores access and removes associated restrictions.</p>
							</span>
						</label>
						<label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
							<input
								type="radio"
								name="appeal-status"
								value="rejected"
								checked={status === "rejected"}
								onChange={() => setStatus("rejected")}
							/>
							<span>
								<strong className="text-slate-900">Reject appeal</strong>
								<p className="text-xs text-slate-500">Maintains current enforcement and closes the appeal.</p>
							</span>
						</label>
					</fieldset>
					<label className="block space-y-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewer note</span>
						<textarea
							value={note}
							onChange={(event) => setNote(event.target.value)}
							className="h-28 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
							placeholder="Summarize your decision"
						/>
					</label>
					<RevertorPreview revertors={revertors} className="border-dashed" />
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
							disabled={disabled}
						>
							{busy ? "Saving…" : "Confirm"}
						</button>
					</footer>
				</form>
			</div>
		</div>
	);
}
