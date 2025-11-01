"use client";

import Image from "next/image";
import { useState } from "react";

import type { QuarantineItem } from "@/hooks/mod/use-quarantine";

export type QuarantineCardProps = {
	item: QuarantineItem;
	selected: boolean;
	onToggleSelected: (id: string) => void;
	onDecision: (id: string, verdict: 'clean' | 'tombstone' | 'blocked') => void;
	decisionDisabled?: boolean;
};

export function QuarantineCard({ item, selected, onToggleSelected, onDecision, decisionDisabled }: QuarantineCardProps) {
	const [revealed, setRevealed] = useState(false);

	return (
		<article className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition ${selected ? 'ring-2 ring-slate-900' : ''}`}>
			<div className="flex items-start justify-between">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.status}</p>
					<p className="text-sm text-slate-600">Captured {new Date(item.captured_at).toLocaleString()}</p>
				</div>
				<label className="flex items-center gap-2 text-xs text-slate-500">
					<input
						type="checkbox"
						checked={selected}
						onChange={() => onToggleSelected(item.id)}
						className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
					/>
					Select
				</label>
			</div>
			<div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
				<button
					type="button"
					onClick={() => setRevealed((value) => !value)}
					className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60 text-sm font-semibold text-white transition"
				>
					{revealed ? 'Hide preview' : 'Reveal preview'}
				</button>
				{item.preview_url ? (
					<Image
						src={item.preview_url}
						alt="Quarantined media preview"
						unoptimized
						width={640}
						height={360}
						className={`h-40 w-full object-cover transition ${revealed ? 'blur-none opacity-100' : 'blur-sm opacity-80'}`}
					/>
				) : (
					<p className="h-40 p-4 text-sm text-slate-500">No preview available.</p>
				)}
			</div>
			{item.ocr_snippet && (
				<p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">OCR: {item.ocr_snippet}</p>
			)}
			<div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
				{Object.entries(item.scores ?? {}).map(([key, value]) => (
					<span key={key} className="rounded-full bg-slate-100 px-2 py-1 font-semibold">
						{key}: {value.toFixed(2)}
					</span>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => onDecision(item.id, 'clean')}
					className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
					disabled={decisionDisabled}
				>
					Clean
				</button>
				<button
					type="button"
					onClick={() => onDecision(item.id, 'tombstone')}
					className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
					disabled={decisionDisabled}
				>
					Tombstone
				</button>
				<button
					type="button"
					onClick={() => onDecision(item.id, 'blocked')}
					className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
					disabled={decisionDisabled}
				>
					Block
				</button>
			</div>
		</article>
	);
}
