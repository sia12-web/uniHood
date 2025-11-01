"use client";

import Link from "next/link";

import type { CommunityGroup } from "@/lib/communities";

function resolveVisibilityLabel(visibility: CommunityGroup["visibility"]) {
	switch (visibility) {
		case "public":
			return "Public";
		case "private":
			return "Private";
		case "secret":
			return "Secret";
		default:
			return visibility;
	}
}

export function GroupHeader({ group }: { group: CommunityGroup }) {
	const visibilityLabel = resolveVisibilityLabel(group.visibility);

	return (
		<section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
			<div className="absolute inset-0 bg-gradient-to-r from-midnight via-indigo-600/60 to-slate-900/40" aria-hidden />
			<div className="relative flex flex-col gap-6 p-8 text-white sm:flex-row sm:items-end">
				<div className="flex shrink-0 items-center gap-4">
					<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/90 text-2xl font-semibold text-midnight shadow-md">
						{group.name.charAt(0).toUpperCase()}
					</div>
					<div className="flex flex-col gap-1">
						<h1 className="text-2xl font-semibold leading-tight lg:text-3xl">{group.name}</h1>
						<p className="text-sm text-white/80">{group.description || "Group for campus collaborators."}</p>
						<div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/70">
							<span className="rounded-full border border-white/20 px-3 py-1">{visibilityLabel}</span>
							{group.role ? <span className="rounded-full border border-white/20 px-3 py-1">{group.role}</span> : null}
						</div>
					</div>
				</div>
				<div className="ml-auto flex flex-col items-start gap-2 sm:items-end">
					<Link
						href={`/communities/groups/${group.id}/members`}
						className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					>
						Members
					</Link>
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-midnight shadow-sm transition hover:bg-warm-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					>
						{group.role ? "Leave group" : "Join group"}
					</button>
				</div>
			</div>
		</section>
	);
}
