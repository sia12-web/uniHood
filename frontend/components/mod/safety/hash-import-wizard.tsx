"use client";

import { useCallback, useMemo, useState } from 'react';

import { useHashImport } from '@/hooks/mod/safety/use-hash-import';

export function HashImportWizard() {
	const { rows, parseFile, parseError, importRows, importing, result, reset, hasInvalid } = useHashImport();
	const [defaultLabel, setDefaultLabel] = useState('');
	const [defaultSource, setDefaultSource] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);

	const previewRows = useMemo(() => rows.slice(0, 200), [rows]);

	const handleFile = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;
			setError(null);
			setFileName(file.name);
			await parseFile(file);
		},
		[parseFile]
	);

	const handleImport = useCallback(async () => {
		setError(null);
		try {
			await importRows({
				defaultLabel: defaultLabel.trim() || undefined,
				defaultSource: defaultSource.trim() || undefined,
			});
		} catch (importError) {
			setError(importError instanceof Error ? importError.message : 'Unable to import rows');
		}
	}, [importRows, defaultLabel, defaultSource]);

	const invalidCount = useMemo(() => rows.filter((row) => row.errors?.length).length, [rows]);
	const validCount = rows.length - invalidCount;

	const canImport = validCount > 0 && !importing;

	return (
		<section className="space-y-6">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold text-slate-900">Hash import wizard</h1>
				<p className="text-sm text-slate-600">Upload CSV, JSON, or simple YAML lists of perceptual hash entries. Validation runs client-side before batching to the moderation API.</p>
			</header>

			<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
				<label className="flex flex-col items-center gap-3 text-center" htmlFor="hash-import-input">
					<span className="text-base font-semibold text-slate-900">Select a file</span>
					<span className="text-xs text-slate-500">Accepted formats: .csv, .json, .yaml</span>
					<input
						type="file"
						id="hash-import-input"
						accept=".csv,.json,.yaml,.yml,text/csv,application/json,text/yaml,application/x-yaml"
						onChange={handleFile}
						className="hidden"
					/>
					<span className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">{fileName ?? 'Choose file'}</span>
				</label>
			</div>

			{parseError && <p className="text-sm text-rose-600">{parseError}</p>}
			{error && <p className="text-sm text-rose-600">{error}</p>}
			{result && <p className="text-sm text-emerald-600">Successfully imported {result.processed.toLocaleString()} rows.</p>}

			<div className="grid gap-4 sm:grid-cols-2">
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Default label
					<input
						type="text"
						value={defaultLabel}
						onChange={(event) => setDefaultLabel(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="eg. CSAM"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Default source
					<input
						type="text"
						value={defaultSource}
						onChange={(event) => setDefaultSource(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="eg. NCMEC"
					/>
				</label>
			</div>

			{rows.length > 0 && (
				<div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
					<header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
						<span>Previewing {previewRows.length} of {rows.length} parsed rows</span>
						<span className="text-xs text-slate-500">{validCount} valid · {invalidCount} invalid</span>
					</header>
					<div className="max-h-80 overflow-y-auto">
						<table className="min-w-full divide-y divide-slate-200 text-xs text-slate-600">
							<thead className="bg-slate-50">
								<tr>
									<th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Line</th>
									<th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Algo</th>
									<th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Hash</th>
									<th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Label</th>
									<th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Source</th>
									<th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Errors</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{previewRows.map((row) => (
									<tr key={`${row.line}-${row.hash}`} className={row.errors?.length ? 'bg-rose-50' : ''}>
										<td className="px-3 py-2 font-mono">{row.line}</td>
										<td className="px-3 py-2">{row.algo}</td>
										<td className="px-3 py-2 font-mono">{row.hash}</td>
										<td className="px-3 py-2">{row.label ?? '—'}</td>
										<td className="px-3 py-2">{row.source ?? '—'}</td>
										<td className="px-3 py-2 text-rose-600">{row.errors?.join(', ') ?? '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={handleImport}
					className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
					disabled={!canImport}
				>
					{importing ? 'Importing…' : hasInvalid ? 'Import valid rows' : 'Import rows'}
				</button>
				<button
					type="button"
					onClick={() => {
						reset();
						setDefaultLabel('');
						setDefaultSource('');
						setFileName(null);
						setError(null);
					}}
					className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
					disabled={importing && !result}
				>
					Reset
				</button>
				{hasInvalid && <span className="text-xs text-rose-600">Invalid rows will be skipped.</span>}
			</div>
		</section>
	);
}
