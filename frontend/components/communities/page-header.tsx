"use client";

import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
	return (
		<header className="flex flex-col gap-2 border-b border-slate-200 pb-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-2xl font-semibold text-slate-900" data-testid="communities-page-title">
						{title}
					</h1>
					{description ? <p className="max-w-2xl text-sm text-slate-600">{description}</p> : null}
				</div>
				{actions ? <div className="shrink-0">{actions}</div> : null}
			</div>
		</header>
	);
}
