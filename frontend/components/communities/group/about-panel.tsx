"use client";

import { useMemo } from "react";

import { useGroupContext } from "./context";

function formatDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}

export function GroupAboutPanel() {
	const group = useGroupContext();
	const createdAt = useMemo(() => formatDate(group.created_at), [group.created_at]);

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h2 className="text-lg font-semibold text-slate-900">About {group.name}</h2>
				<p className="mt-2 text-sm text-slate-700">{group.description || "This group is getting its description soon."}</p>
				<dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<div className="space-y-1">
						<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visibility</dt>
						<dd className="text-sm text-slate-700">{group.visibility}</dd>
					</div>
					<div className="space-y-1">
						<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</dt>
						<dd className="text-sm text-slate-700">{createdAt}</dd>
					</div>
					<div className="space-y-1">
						<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</dt>
						<dd className="text-sm text-slate-700">{group.tags.length ? group.tags.join(" · ") : "General"}</dd>
					</div>
				</dl>
			</section>
			<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h3 className="text-base font-semibold text-slate-900">Pinned resources</h3>
				<p className="mt-2 text-sm text-slate-600">
					Moderators can add onboarding links or highlight posts here in the next milestone. For now, keep sharing updates in the
					posts tab.
				</p>
			</section>
		</div>
	);
}
