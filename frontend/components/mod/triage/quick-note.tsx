"use client";

import { useState } from "react";

import { modApi } from "@/lib/api-mod";
import { useToast } from "@/hooks/use-toast";

export type QuickNoteProps = {
	caseId: string;
	onSubmitted?: () => void;
};

export function QuickNote({ caseId, onSubmitted }: QuickNoteProps) {
	const [note, setNote] = useState("");
	const [pending, setPending] = useState(false);
	const toast = useToast();

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!note.trim()) return;
		setPending(true);
		try {
			await modApi.post("/admin/cases/note", { case_id: caseId, note: note.trim() });
			setNote("");
			onSubmitted?.();
			toast.push({ id: `note-${caseId}`, title: "Note added", description: "Audit note recorded", variant: "success" });
		} catch (error) {
			const description = error instanceof Error ? error.message : "Unable to add note";
			toast.push({ id: `note-${caseId}-error`, title: "Note failed", description, variant: "error" });
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-2">
			<label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="quick-note-input">
				Quick note
			</label>
			<textarea
				id="quick-note-input"
				value={note}
				onChange={(event) => setNote(event.target.value)}
				className="h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
				placeholder="Add an audit note"
			/>
			<div className="flex items-center justify-end">
				<button
					type="submit"
					disabled={pending || !note.trim()}
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
				>
					{pending ? "Saving…" : "Save note"}
				</button>
			</div>
		</form>
	);
}
