"use client";

import { useState, type ChangeEvent } from "react";

import type { BundleImportRequest, BundleImportResponse } from "@/hooks/mod/tools/use-bundles";

export type BundleImportWizardProps = {
	onSubmit(request: BundleImportRequest): Promise<BundleImportResponse>;
	pending: boolean;
};

export function BundleImportWizard({ onSubmit, pending }: BundleImportWizardProps) {
	const [yaml, setYaml] = useState("");
	const [result, setResult] = useState<BundleImportResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [confirmInput, setConfirmInput] = useState("");

	function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		void file.text().then((text) => setYaml(text));
	}

	async function runImport(dryRun: boolean) {
		setError(null);
		if (!yaml.trim()) {
			setError("Upload or paste bundle YAML first");
			return;
		}
		try {
			const response = await onSubmit({ contents: yaml, dry_run: dryRun });
			setResult(response);
			if (!dryRun) {
				setConfirmVisible(false);
				setConfirmInput("");
			}
		} catch (importError) {
			setError(importError instanceof Error ? importError.message : "Import failed");
		}
	}

	async function handleExecute() {
		if (!result || !result.dry_run) {
			setError("Run a dry-run before enabling bundles");
			return;
		}
		if (!confirmVisible) {
			setConfirmVisible(true);
			return;
		}
		if (confirmInput.trim().toUpperCase() !== "RUN") {
			setError("Type RUN to confirm import");
			return;
		}
		await runImport(false);
	}

	return (
		<section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Import bundles</h2>
				<p className="text-sm text-slate-600">Dry-run first to review changes. Only execute after verifying diffs and signatures.</p>
			</header>

			<div className="grid gap-3 md:grid-cols-[2fr_1fr]">
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Bundle YAML</span>
					<textarea
						value={yaml}
						onChange={(event) => setYaml(event.target.value)}
						className="h-48 w-full rounded-xl border border-slate-200 bg-slate-900/5 px-3 py-3 font-mono text-sm text-slate-800"
						spellCheck={false}
					/>
					<p className="text-xs text-slate-500">Paste YAML or upload file.</p>
				</label>
				<div className="space-y-3">
					<label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Upload file</span>
						<input type="file" accept=".yml,.yaml" onChange={handleFileChange} className="mt-1 text-sm text-slate-600" />
					</label>
					<button
						type="button"
						onClick={() => runImport(true)}
						disabled={pending}
						className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
					>
						{pending ? "Running dry-run…" : "Dry-run"}
					</button>
					<button
						type="button"
						onClick={handleExecute}
						disabled={pending || !result?.dry_run}
						className="w-full rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:text-rose-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
					>
						{pending ? "Importing…" : "Enable bundles"}
					</button>
				</div>
			</div>

			{error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

			{result ? (
				<section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<header className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
						<strong>{result.dry_run ? "Dry-run summary" : "Import enqueued"}</strong>
						{result.job_id ? <span>Job {result.job_id}</span> : null}
					</header>
					<div className="grid gap-3 text-sm text-slate-700 md:grid-cols-3">
						<span className="rounded-xl border border-slate-200 bg-white px-3 py-2">Created: <strong>{result.created}</strong></span>
						<span className="rounded-xl border border-slate-200 bg-white px-3 py-2">Updated: <strong>{result.updated}</strong></span>
						<span className="rounded-xl border border-slate-200 bg-white px-3 py-2">Unchanged: <strong>{result.unchanged}</strong></span>
					</div>
					<p className={`text-sm font-semibold ${result.hmac_valid ? "text-emerald-600" : "text-rose-600"}`}>
						Signature {result.hmac_valid ? "verified" : "invalid"}
					</p>
				</section>
			) : null}

			{confirmVisible ? (
				<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
					<p className="text-sm font-semibold text-rose-700">Type RUN to enable bundles.</p>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<label htmlFor="bundle-confirm" className="sr-only">
							Type RUN to confirm
						</label>
						<input
							id="bundle-confirm"
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
		</section>
	);
}
