"use client";

import { useState } from "react";

import type { SavedAuditSearch } from "@/hooks/mod/audit/use-audit-saved";

export type SavedSearchesProps = {
	searches: SavedAuditSearch[];
	onCreate: (name: string) => void;
	onSelect: (search: SavedAuditSearch) => void;
	onDelete: (id: string) => void;
	onRename: (id: string, name: string) => void;
};

export function SavedSearches({ searches, onCreate, onSelect, onDelete, onRename }: SavedSearchesProps) {
	const [name, setName] = useState("");

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
			<header className="mb-3 flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Saved searches</h2>
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name current filters"
						className="h-8 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
					/>
					<button
						type="button"
						onClick={() => {
							if (!name.trim()) {
								return;
							}
							onCreate(name.trim());
							setName("");
						}}
						className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-800"
					>
						Save
					</button>
				</div>
			</header>
			{searches.length ? (
				<ul className="space-y-2">
					{searches.map((search) => (
						<li key={search.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2">
							<button
								type="button"
								onClick={() => onSelect(search)}
								className="flex-1 text-left text-sm font-medium text-slate-700 hover:text-slate-900"
							>
								{search.name}
								<span className="block text-xs text-slate-500">Saved {new Date(search.created_at).toLocaleString()}</span>
							</button>
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={() => {
										const next = window.prompt("Rename search", search.name);
										if (next) {
											onRename(search.id, next);
										}
									}}
									className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400"
								>
									Rename
								</button>
								<button
									type="button"
									onClick={() => onDelete(search.id)}
									className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300"
								>
									Delete
								</button>
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-slate-500">No saved searches yet. Save the current filters to pin quick access here.</p>
			)}
		</section>
	);
}
