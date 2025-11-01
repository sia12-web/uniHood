"use client";

import type { ReactNode } from "react";

export function EmptyState({ title, description, cta }: { title: string; description?: string; cta?: ReactNode }) {
	return (
		<section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
			<h2 className="text-xl font-semibold text-slate-900">{title}</h2>
			{description ? <p className="max-w-xl text-sm text-slate-600">{description}</p> : null}
			{cta ? <div>{cta}</div> : null}
		</section>
	);
}
