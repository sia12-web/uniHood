"use client";

import { useEffect } from 'react';

export type OcrDrawerProps = {
	open: boolean;
	onClose(): void;
	heading?: string;
	text: string | null | undefined;
};

export function OcrDrawer({ open, onClose, heading = 'Full OCR', text }: OcrDrawerProps) {
	useEffect(() => {
		function handleKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				onClose();
			}
		}
		if (open) {
			window.addEventListener('keydown', handleKey);
			return () => window.removeEventListener('keydown', handleKey);
		}
		return undefined;
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end bg-black/40 px-4 pb-6 pt-16" role="dialog" aria-modal="true" aria-label={heading}>
			<div className="max-h-[85vh] w-full rounded-3xl bg-white p-6 shadow-xl">
				<div className="flex items-center justify-between gap-4">
					<h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
					>
						Close
					</button>
				</div>
				<div className="mt-4 max-h-[65vh] overflow-y-auto rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
					{text ? text : 'No OCR text available for this item.'}
				</div>
			</div>
		</div>
	);
}
