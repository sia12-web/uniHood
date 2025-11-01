"use client";

import { FormEvent, useState } from "react";

import type { CaseBulkActionRequest } from "@/hooks/mod/use-cases";

export type CasesBulkActionsProps = {
	selectedIds: string[];
	onSubmit: (payload: CaseBulkActionRequest) => void;
	disabled?: boolean;
};

const ACTION_OPTIONS: { value: CaseBulkActionRequest['action']; label: string }[] = [
	{ value: 'assign', label: 'Assign to me' },
	{ value: 'escalate', label: 'Escalate' },
	{ value: 'dismiss', label: 'Dismiss' },
	{ value: 'apply_enforcement', label: 'Apply enforcement' },
];

export function CasesBulkActions({ selectedIds, onSubmit, disabled }: CasesBulkActionsProps) {
	const [action, setAction] = useState<CaseBulkActionRequest['action'] | ''>('');
	const [note, setNote] = useState('');
	const [decision, setDecision] = useState('');

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!action || selectedIds.length === 0) {
			return;
		}
		const payload: CaseBulkActionRequest = {
			action,
			case_ids: selectedIds,
			note: note.trim() || undefined,
		};
		if (action === 'apply_enforcement' && decision.trim()) {
			payload.payload = { decision: decision.trim() };
		}
		onSubmit(payload);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
			<select
				className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
				value={action}
				onChange={(event) => setAction(event.target.value as CaseBulkActionRequest['action'])}
				disabled={disabled}
				aria-label="Select bulk action"
			>
				<option value="">Select action</option>
				{ACTION_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			{action === 'apply_enforcement' && (
				<input
					type="text"
					value={decision}
					onChange={(event) => setDecision(event.target.value)}
					placeholder="Decision key"
					className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
					aria-label="Enforcement decision"
					disabled={disabled}
				/>
			)}
			<input
				type="text"
				value={note}
				onChange={(event) => setNote(event.target.value)}
				placeholder="Optional note"
				className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
				disabled={disabled}
			/>
			<button
				type="submit"
				className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
				disabled={disabled || !action || selectedIds.length === 0}
			>
				Run
			</button>
		</form>
	);
}
