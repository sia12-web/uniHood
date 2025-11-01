"use client";

import Link from "next/link";

const TOOL_CARDS = [
	{
		title: "Actions catalog",
		description: "Create, review, and deactivate moderation actions.",
		href: "/admin/mod/tools/catalog",
		accent: "bg-indigo-100 text-indigo-700 border-indigo-200",
	},
	{
		title: "Macro runner",
		description: "Simulate macros and queue executions with selectors.",
		href: "/admin/mod/tools/macros",
		accent: "bg-emerald-100 text-emerald-700 border-emerald-200",
	},
	{
		title: "Batch unshadow",
		description: "Lift shadow restrictions in bulk with scoped filters.",
		href: "/admin/mod/tools/unshadow",
		accent: "bg-amber-100 text-amber-700 border-amber-200",
	},
	{
		title: "Batch revert",
		description: "Rollback actions like bans, mutes, and removals.",
		href: "/admin/mod/tools/revert",
		accent: "bg-rose-100 text-rose-700 border-rose-200",
	},
	{
		title: "Bundles",
		description: "Export or import guard bundles and presets.",
		href: "/admin/mod/tools/bundles",
		accent: "bg-sky-100 text-sky-700 border-sky-200",
	},
	{
		title: "Jobs",
		description: "Monitor long-running tools and review results logs.",
		href: "/admin/mod/tools/jobs",
		accent: "bg-slate-100 text-slate-700 border-slate-200",
	},
];

const CHECKLIST = [
	"Simulate before execute — dry-run tokens expire after 15 minutes.",
	"Double-check selector scope; include campus when possible to limit blast radius.",
	"Executing requires typing RUN and acknowledging audit logging.",
	"Only staff.admin accounts may run destructive operations.",
];

export function ToolsHomeCards() {
	return (
		<div className="space-y-8">
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{TOOL_CARDS.map((card) => (
					<Link
						key={card.href}
						href={card.href}
						className={`group flex h-full flex-col justify-between rounded-3xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.accent}`}
					>
						<div className="space-y-2">
							<h3 className="text-lg font-semibold">{card.title}</h3>
							<p className="text-sm opacity-80">{card.description}</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Open<span aria-hidden>→</span></span>
					</Link>
				))}
			</section>
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Safety checklist</h2>
				<ul className="mt-4 space-y-2 text-sm text-slate-600">
					{CHECKLIST.map((item) => (
						<li key={item} className="flex items-start gap-2">
							<span aria-hidden className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 font-semibold text-white">✓</span>
							<span>{item}</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
