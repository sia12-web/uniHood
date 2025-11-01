"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { AuditLogEntry } from '@/hooks/mod/use-audit';
import type { QuarantineAttachment, TextScanRecord } from '@/hooks/mod/safety/use-quarantine-item';
import type { ReputationSummary } from '@/hooks/mod/use-reputation';

import { DecisionBar } from './decision-bar';
import { SignalsPanel } from './signals-panel';

export type QuarantineDetailProps = {
	attachment: QuarantineAttachment;
	textScan?: TextScanRecord | null;
	revealed: boolean;
	onReveal: (note: string) => Promise<void> | void;
	revealing?: boolean;
	onDecision: (payload: { verdict: 'clean' | 'tombstone' | 'blocked'; note?: string }) => Promise<void> | void;
	decisionBusy?: boolean;
	auditEntries?: AuditLogEntry[];
		reputation?: ReputationSummary | null;
	onOpenOcr(): void;
	onPrev?: () => void;
	onNext?: () => void;
	hasPrev?: boolean;
	hasNext?: boolean;
};

export function QuarantineDetail({
	attachment,
	textScan,
	revealed,
	onReveal,
	revealing,
	onDecision,
	decisionBusy,
	auditEntries,
	reputation,
	onOpenOcr,
	onPrev,
	onNext,
	hasPrev,
	hasNext,
}: QuarantineDetailProps) {
	const [revealModal, setRevealModal] = useState(false);
	const [revealNote, setRevealNote] = useState('');
	const [revealError, setRevealError] = useState<string | null>(null);

	useEffect(() => {
		if (revealed) {
			setRevealModal(false);
			setRevealNote('');
			setRevealError(null);
		}
	}, [revealed]);

	const subjectLink = useMemo(() => {
		if (attachment.subject_url) return attachment.subject_url;
		if (!attachment.subject_type || !attachment.subject_id) return null;
		return `/admin/mod/cases/${attachment.subject_type.toLowerCase()}/${attachment.subject_id}`;
	}, [attachment.subject_id, attachment.subject_type, attachment.subject_url]);

	const ownerLink = attachment.owner_handle ? `/profiles/${attachment.owner_handle}` : undefined;

	const metadataEntries = useMemo(() => {
		if (!attachment.metadata) return [] as Array<[string, unknown]>;
		return Object.entries(attachment.metadata).slice(0, 12);
	}, [attachment.metadata]);

	const handleReveal = async () => {
		try {
			await onReveal(revealNote.trim());
		} catch (error) {
			setRevealError(error instanceof Error ? error.message : 'Unable to reveal media');
		}
	};

	return (
		<article className="space-y-6">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold text-slate-900">Attachment {attachment.id}</h1>
				<div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
					<span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">{attachment.status}</span>
					<span>Created {new Date(attachment.created_at).toLocaleString()}</span>
					{attachment.safety_status && (
						<span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
							{attachment.safety_status}
						</span>
					)}
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<section className="space-y-4">
					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<header className="mb-3 flex items-center justify-between">
							<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview</h2>
							<div className="flex items-center gap-2">
								{attachment.download_url && (
									<a
										href={attachment.download_url}
										target="_blank"
										rel="noreferrer"
										className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
									>
										Download
									</a>
								)}
								<button
									type="button"
									onClick={() => setRevealModal(true)}
									className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
									disabled={revealed || revealing}
								>
									{revealed ? 'Revealed' : revealing ? 'Revealing…' : 'Reveal media'}
								</button>
							</div>
						</header>
						<div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
							{attachment.preview_url ? (
								<Image
									src={attachment.preview_url}
									alt="Quarantined media preview"
									width={960}
									height={540}
									priority={false}
									className={`max-h-[480px] w-full object-contain transition ${revealed ? 'blur-none opacity-100' : 'blur-xl opacity-80'}`}
								/>
							) : (
								<div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-slate-500">
									<span>No preview available</span>
									{attachment.type === 'file' && attachment.download_url && (
										<span>Use download to inspect the file.</span>
									)}
								</div>
							)}
							{!revealed && (
								<div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-center text-sm font-semibold text-white">
									Media redacted until reveal confirmation.
								</div>
							)}
						</div>
					</div>

					<SignalsPanel
						scores={attachment.signals}
						hashMatch={attachment.hash_match}
						ocrSnippet={textScan?.ocr ?? null}
						textScan={textScan ?? null}
						revealed={revealed}
						onRequestOcr={onOpenOcr}
					/>
				</section>

				<aside className="space-y-4">
					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Subject</h2>
						<dl className="mt-3 space-y-2 text-sm text-slate-600">
							{subjectLink && (
								<div>
									<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</dt>
									<dd>
										<Link href={subjectLink} className="text-indigo-600 underline-offset-2 hover:underline">
											{attachment.subject_type} · {attachment.subject_id}
										</Link>
									</dd>
								</div>
							)}
							{attachment.campus_id && (
								<div>
									<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campus</dt>
									<dd>{attachment.campus_id}</dd>
								</div>
							)}
							{attachment.owner_id && (
								<div>
									<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</dt>
									<dd>
										{ownerLink ? (
											<Link href={ownerLink} className="text-indigo-600 underline-offset-2 hover:underline">
												{attachment.owner_handle ?? attachment.owner_id}
											</Link>
										) : (
											<span>{attachment.owner_handle ?? attachment.owner_id}</span>
										)}
									</dd>
								</div>
							)}
						</dl>
					</section>

					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reports & cases</h2>
						<div className="mt-3 space-y-2 text-sm text-slate-600">
							<span>Reporter count: {attachment.reporter_count ?? 0}</span>
							{attachment.audit_target_id && (
								<Link href={`/admin/mod/cases/${attachment.audit_target_id}`} className="text-indigo-600 underline-offset-2 hover:underline">
									Open related case
								</Link>
							)}
						</div>
					</section>

					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent reputation</h2>
						{reputation ? (
							<div className="space-y-3 text-sm text-slate-600">
								<div className="flex items-center gap-3">
									<span className="text-3xl font-semibold text-slate-900">{reputation.score}</span>
									<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">{reputation.risk_band}</span>
								</div>
								<ul className="space-y-2 text-xs text-slate-500">
									{(reputation.events_preview ?? []).slice(0, 5).map((entry) => (
										<li key={entry.id}>
											<span className="font-semibold text-slate-600">{entry.delta >= 0 ? '+' : ''}{entry.delta}</span> · {entry.kind} · {new Date(entry.occurred_at).toLocaleString()}
											{entry.summary ? ` — ${entry.summary}` : ''}
										</li>
									))}
								</ul>
							</div>
						) : (
							<p className="text-sm text-slate-500">No reputation data for this user.</p>
						)}
					</section>

					<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Audit trail</h2>
						{auditEntries?.length ? (
							<ul className="mt-3 space-y-2 text-xs text-slate-600">
								{auditEntries.map((entry) => (
									<li key={entry.id}>
										<span className="font-semibold">{entry.type}</span> — {entry.message}
										<div className="text-[11px] text-slate-400">{new Date(entry.created_at).toLocaleString()}</div>
									</li>
								))}
							</ul>
						) : (
							<p className="mt-3 text-sm text-slate-500">No audit entries yet.</p>
						)}
					</section>

					{metadataEntries.length > 0 && (
						<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
							<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Metadata</h2>
							<dl className="mt-3 space-y-2 text-xs text-slate-600">
								{metadataEntries.map(([key, value]) => (
									<div key={key}>
										<dt className="font-semibold uppercase tracking-wide text-slate-500">{key}</dt>
										<dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
									</div>
								))}
							</dl>
						</section>
					)}
				</aside>
			</div>

			<DecisionBar
				onDecision={onDecision}
				busy={decisionBusy}
				onPrev={onPrev}
				onNext={onNext}
				hasPrev={hasPrev}
				hasNext={hasNext}
			/>

			{revealModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
					<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
						<h2 className="text-lg font-semibold text-slate-900">Reveal media</h2>
						<p className="mt-2 text-sm text-slate-600">
							Provide a short justification for auditing before revealing sensitive media.
						</p>
						<label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="reveal-note">
							Justification
						</label>
						<textarea
							id="reveal-note"
							value={revealNote}
							onChange={(event) => setRevealNote(event.target.value)}
							className="mt-1 h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
							placeholder="Why are you revealing this item?"
						/>
						{revealError && <p className="mt-2 text-sm text-rose-600">{revealError}</p>}
						<div className="mt-6 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => {
								setRevealModal(false);
								setRevealError(null);
							}}
								className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
								disabled={revealing}
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleReveal}
								className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
								disabled={!revealNote.trim() || revealing}
							>
								Reveal media
							</button>
						</div>
					</div>
				</div>
			)}
		</article>
	);
}
