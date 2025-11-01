"use client";

import { useCallback, useState } from 'react';

import type { PerceptualHashMatch, SafetySignalScores, TextScanRecord } from '@/hooks/mod/safety/use-quarantine-item';

import { ScoreBars } from './score-bars';

export type SignalsPanelProps = {
	scores?: SafetySignalScores | null;
	hashMatch?: PerceptualHashMatch | null;
	ocrSnippet?: string | null;
	textScan?: TextScanRecord | null;
	revealed: boolean;
	onRequestOcr(): void;
};

export function SignalsPanel({ scores, hashMatch, ocrSnippet, textScan, revealed, onRequestOcr }: SignalsPanelProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		if (!hashMatch?.hash) return;
		try {
			await navigator.clipboard.writeText(hashMatch.hash);
			setCopied(true);
			setTimeout(() => setCopied(false), 1_500);
		} catch (error) {
			console.warn('Unable to copy hash', error);
		}
	}, [hashMatch?.hash]);

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<ScoreBars scores={scores} />

			<section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<header className="flex items-center justify-between">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Perceptual match</h3>
					{hashMatch?.hash && (
						<button
							type="button"
							onClick={handleCopy}
							className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
							aria-live="polite"
						>
							{copied ? 'Copied!' : 'Copy hash'}
						</button>
					)}
				</header>
				{hashMatch ? (
					<dl className="grid grid-cols-1 gap-y-2 text-sm text-slate-600">
						<div className="flex flex-col">
							<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Algorithm</dt>
							<dd>{hashMatch.algo}</dd>
						</div>
						<div className="flex flex-col">
							<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hash</dt>
							<dd className="font-mono text-xs text-slate-800">{hashMatch.hash}</dd>
						</div>
						{hashMatch.score !== undefined && hashMatch.score !== null && (
							<div className="flex flex-col">
								<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Match confidence</dt>
								<dd>{hashMatch.score.toFixed(3)}</dd>
							</div>
						)}
						{hashMatch.label && (
							<div className="flex flex-col">
								<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Label</dt>
								<dd>{hashMatch.label}</dd>
							</div>
						)}
						{hashMatch.source && (
							<div className="flex flex-col">
								<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</dt>
								<dd>{hashMatch.source}</dd>
							</div>
						)}
					</dl>
				) : (
					<p className="text-sm text-slate-500">No perceptual hash match detected.</p>
				)}
			</section>

			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
				<header className="mb-2 flex items-center justify-between">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">OCR snippet</h3>
					<button
						type="button"
						onClick={onRequestOcr}
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
						disabled={!revealed}
					>
						View full OCR
					</button>
				</header>
				{revealed ? (
					ocrSnippet ? (
						<p className="text-sm leading-relaxed text-slate-600">{ocrSnippet}</p>
					) : (
						<p className="text-sm text-slate-500">No OCR captured for this attachment.</p>
					)
				) : (
					<p className="text-sm text-slate-500">Reveal the media to view OCR content.</p>
				)}
			</section>

			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
				<header className="mb-2 flex items-center justify-between">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Related text scan</h3>
					{textScan && (
						<a
							href={`/admin/mod/tools/text-scans/${textScan.id}`}
							target="_blank"
							rel="noreferrer"
							className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
						>
							Open record
						</a>
					)}
				</header>
				{textScan ? (
					<dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
						<div>
							<dt className="font-semibold uppercase tracking-wide text-slate-500">Created</dt>
							<dd>{new Date(textScan.created_at).toLocaleString()}</dd>
						</div>
						<div>
							<dt className="font-semibold uppercase tracking-wide text-slate-500">Subject</dt>
							<dd>{textScan.subject_type} · {textScan.subject_id}</dd>
						</div>
					</dl>
				) : (
					<p className="text-sm text-slate-500">No related text scan found.</p>
				)}
			</section>
		</div>
	);
}
