"use client";

import type { CannedMacroRecord } from "@/hooks/mod/triage/use-canned";

export type PresetActionId = "harassment" | "spam" | "nsfw";

export type CannedActionSelection =
	| { kind: "preset"; id: PresetActionId }
	| { kind: "macro"; macro: CannedMacroRecord };

export type CannedActionsProps = {
	macros: CannedMacroRecord[];
	disabled?: boolean;
	onSelect(selection: CannedActionSelection): void;
};

const PRESETS: Array<{ id: PresetActionId; label: string; description: string }> = [
	{ id: "harassment", label: "Harassment", description: "Tombstone + warn" },
	{ id: "spam", label: "Spam", description: "Shadow + restrict create 60m" },
	{ id: "nsfw", label: "NSFW", description: "Remove unsafe content" },
];

export function CannedActions({ macros, disabled = false, onSelect }: CannedActionsProps) {
	return (
		<section className="space-y-3">
			<header className="flex items-center justify-between">
				<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Canned actions</h3>
			</header>
			<div className="grid gap-3 md:grid-cols-2">
				{PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						disabled={disabled}
						onClick={() => onSelect({ kind: "preset", id: preset.id })}
						data-triage-macro="preset"
						className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<span className="text-sm font-semibold text-slate-900">{preset.label}</span>
						<span className="text-xs text-slate-500">{preset.description}</span>
					</button>
				))}
			</div>
			{macros.length ? (
				<div className="space-y-2">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Macro presets</p>
					<div className="grid gap-2">
						{macros.map((macro) => (
							<button
								key={`${macro.key}-${macro.version}`}
								type="button"
								onClick={() => onSelect({ kind: "macro", macro })}
								disabled={disabled}
								data-triage-macro="macro"
								className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-mono text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<span className="text-sm font-semibold text-slate-900">
									{macro.key}@{macro.version}
								</span>
								{macro.description ? <span className="text-xs text-slate-500">{macro.description}</span> : null}
							</button>
						))}
					</div>
				</div>
			) : null}
		</section>
	);
}
