"use client";

export type KeyboardHelpProps = {
	open: boolean;
	onClose(): void;
};

const SHORTCUTS: Array<{ combo: string; description: string }> = [
	{ combo: "J / K", description: "Next / previous case" },
	{ combo: "Enter", description: "Open case drawer" },
	{ combo: "A", description: "Assign to me" },
	{ combo: "E", description: "Escalate" },
	{ combo: "D", description: "Dismiss" },
	{ combo: "T", description: "Tombstone" },
	{ combo: "R", description: "Remove" },
	{ combo: "M", description: "Open macro picker" },
	{ combo: "N", description: "Add quick note" },
	{ combo: "S", description: "Toggle skip after action" },
	{ combo: "?", description: "Toggle help" },
];

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
	if (!open) return null;

	return (
		<div role="dialog" aria-modal="true" aria-label="Triage keyboard shortcuts" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
			<div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
				<header className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-slate-900">Keyboard shortcuts</h2>
					<button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-300">
						Close
					</button>
				</header>
				<ul className="mt-4 space-y-2 text-sm text-slate-600">
					{SHORTCUTS.map((shortcut) => (
						<li key={shortcut.combo} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
							<span className="font-semibold text-slate-900">{shortcut.combo}</span>
							<span>{shortcut.description}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
