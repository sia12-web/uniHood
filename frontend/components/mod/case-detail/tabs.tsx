"use client";

import { type ReactNode, useState } from "react";

export type CaseDetailTab = {
	id: string;
	label: string;
	content: ReactNode;
};

export type CaseDetailTabsProps = {
	tabs: CaseDetailTab[];
	defaultTabId?: string;
};

export function CaseDetailTabs({ tabs, defaultTabId }: CaseDetailTabsProps) {
	const initial = defaultTabId ?? tabs[0]?.id ?? "timeline";
	const [active, setActive] = useState(initial);

	return (
		<section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
			<div role="tablist" aria-label="Case detail navigation" className="flex items-center gap-2 border-b border-slate-200 px-4">
				{tabs.map((tab) => {
					const isActive = tab.id === active;
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActive(tab.id)}
							className={`relative -mb-px border-b-2 px-4 py-3 text-sm font-semibold transition ${isActive ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
							role="tab"
							aria-selected={isActive ? 'true' : 'false'}
						>
							{tab.label}
						</button>
					);
				})}
			</div>
			<div role="tabpanel" className="px-4 py-4">
				{tabs.find((tab) => tab.id === active)?.content ?? <p className="text-sm text-slate-500">Nothing to show.</p>}
			</div>
		</section>
	);
}
