"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { ToolActionKind } from "@/hooks/mod/tools/use-catalog";
import { parseJsonWithMeta, validateActionSpec, buildJsonErrorMessage, GUARD_SPEC_SNIPPETS } from "@/lib/json-schema-helpers";

export type CreateActionDialogProps = {
	open: boolean;
	loading?: boolean;
	onDismiss(): void;
	onCreate(payload: { key: string; version: number; kind: ToolActionKind; description?: string; spec: unknown }): void;
};

const DEFAULT_SPEC = `{
  "name": "temporary cooldown",
  "steps": [
    { "use": "restriction.cooldown", "vars": { "duration": "15m" } }
  ],
  "guards": []
}`;

export function CreateActionDialog({ open, loading, onDismiss, onCreate }: CreateActionDialogProps) {
	const [keyValue, setKeyValue] = useState("tool.example");
	const [version, setVersion] = useState<number>(Date.now());
	const [description, setDescription] = useState<string>("");
	const [kind, setKind] = useState<ToolActionKind>("atomic");
	const [specDraft, setSpecDraft] = useState(DEFAULT_SPEC);
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);

	useEffect(() => {
		if (!open) {
			setError(null);
			setWarnings([]);
		}
	}, [open]);

	const parsed = useMemo(() => parseJsonWithMeta(specDraft), [specDraft]);
	const validation = useMemo(() => {
		if (!parsed.ok) {
			return { valid: false, errors: [buildJsonErrorMessage(parsed)!], warnings: [] };
		}
		return validateActionSpec(parsed.value);
	}, [parsed]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setWarnings([]);
		if (!keyValue.trim()) {
			setError("Key is required");
			return;
		}
		if (!Number.isFinite(version)) {
			setError("Version must be numeric");
			return;
		}
		if (!parsed.ok) {
			setError(buildJsonErrorMessage(parsed));
			return;
		}
		if (!validation.valid) {
			setError(validation.errors.join("\n"));
			setWarnings(validation.warnings);
			return;
		}
		if (validation.warnings.length) {
			setWarnings(validation.warnings);
		}
		onCreate({
			key: keyValue.trim(),
			version: Number(version),
			kind,
			description: description.trim() || undefined,
			spec: parsed.value,
		});
	}

	const isOpen = open;

	if (!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="create-action-heading">
			<div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-xl">
				<form onSubmit={handleSubmit} className="space-y-6 p-6">
					<header className="flex items-start justify-between gap-4">
						<div>
							<h2 id="create-action-heading" className="text-lg font-semibold text-slate-900">
								New catalog action
							</h2>
							<p className="mt-1 text-sm text-slate-500">Dry-run in backend before enabling. Spec must include at least one step.</p>
						</div>
						<button type="button" onClick={onDismiss} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-300">
							Close
						</button>
					</header>

					<div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Kind</span>
						<nav className="flex gap-2">
							<button
								type="button"
								className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === "atomic" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}
								onClick={() => setKind("atomic")}
							>
								Atomic
							</button>
							<button
								type="button"
								className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === "macro" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}
								onClick={() => setKind("macro")}
							>
								Macro
							</button>
						</nav>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
							<span>Action key</span>
							<input
								type="text"
								value={keyValue}
								onChange={(event) => setKeyValue(event.target.value)}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
								placeholder="macro.cleanup"
							/>
						</label>
						<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
							<span>Version</span>
							<input
								type="number"
								value={version}
								onChange={(event) => setVersion(Number(event.target.value))}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
								min={1}
							/>
						</label>
					</div>

					<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Description (optional)</span>
						<input
							type="text"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
							placeholder="Short summary for audit logs"
						/>
					</label>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label htmlFor="action-spec" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
								Spec JSON
							</label>
							<button
								type="button"
								onClick={() => setSpecDraft(DEFAULT_SPEC)}
								className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
							>
								Reset example
							</button>
						</div>
						<textarea
							id="action-spec"
							value={specDraft}
							onChange={(event) => setSpecDraft(event.target.value)}
							className="h-64 w-full rounded-xl border border-slate-200 bg-slate-900/5 px-3 py-3 font-mono text-sm text-slate-800"
							spellCheck={false}
							aria-describedby="spec-help"
						/>
						<p id="spec-help" className="text-xs text-slate-500">
							Include guards and steps as JSON. Validation runs on submit.
						</p>
					</div>

					<div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guard snippets</p>
						<div className="grid gap-2 sm:grid-cols-2">
							{GUARD_SPEC_SNIPPETS.map((snippet, index) => (
								<button
									key={index}
									type="button"
									onClick={() => setSpecDraft((prev) => `${prev.trim()}\n\n${snippet.trim()}`)}
									className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-mono text-slate-600 hover:border-slate-300"
								>
									<pre className="whitespace-pre-wrap break-all">{snippet}</pre>
								</button>
							))}
						</div>
					</div>

					{error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
					{warnings.length ? (
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
							<ul className="list-disc pl-4">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="flex flex-wrap items-center justify-end gap-3">
						<button type="button" onClick={onDismiss} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300">
							Cancel
						</button>
						<button
							type="submit"
							disabled={loading}
							className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
						>
							{loading ? "Saving…" : "Create action"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
