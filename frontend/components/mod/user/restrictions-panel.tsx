"use client";

import type { RestrictionRecord } from "@/hooks/mod/user/use-restrictions";

export type RestrictionsPanelProps = {
	active: RestrictionRecord[];
	historical?: RestrictionRecord[];
	loading?: boolean;
	view: "active" | "historical";
	onViewChange?: (view: "active" | "historical") => void;
	onCreateRestriction?: () => void;
	onRevokeRestriction?: (restriction: RestrictionRecord) => void;
	canManage?: boolean;
};

function formatExpires(value?: string | null) {
	if (!value) return "—";
	return new Date(value).toLocaleString();
}

export function RestrictionsPanel({
	active,
	historical,
	loading,
	view,
	onViewChange,
	onCreateRestriction,
	onRevokeRestriction,
	canManage = false,
}: RestrictionsPanelProps) {
	const records = view === "active" ? active : historical ?? [];

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 className="text-base font-semibold text-slate-900">Restrictions</h3>
					<p className="text-sm text-slate-500">View active and historical enforcement actions.</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5 text-xs">
						<button
							type="button"
							className={`rounded-full px-3 py-1 font-semibold ${
								view === "active" ? "bg-white text-slate-900 shadow" : "text-slate-600"
							}`}
							onClick={() => onViewChange?.("active")}
						>
							Active ({active.length})
						</button>
						<button
							type="button"
							className={`rounded-full px-3 py-1 font-semibold ${
								view === "historical" ? "bg-white text-slate-900 shadow" : "text-slate-600"
							}`}
							onClick={() => onViewChange?.("historical")}
							disabled={!historical?.length}
						>
							Expired ({historical?.length ?? 0})
						</button>
					</div>
					{canManage ? (
						<button
							type="button"
							onClick={() => onCreateRestriction?.()}
							className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							New restriction
						</button>
					) : null}
				</div>
			</div>
			<div className="mt-4 overflow-x-auto">
				<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
					<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th scope="col" className="px-3 py-2">
								Mode
							</th>
							<th scope="col" className="px-3 py-2">
								Scope
							</th>
							<th scope="col" className="px-3 py-2">
								Reason
							</th>
							<th scope="col" className="px-3 py-2">
								Expires
							</th>
							<th scope="col" className="px-3 py-2">
								Added by
							</th>
							{canManage && view === "active" ? <th className="px-3 py-2" aria-label="Actions" /> : null}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{loading ? (
							<tr>
								<td colSpan={canManage && view === "active" ? 6 : 5} className="px-3 py-8 text-center text-sm text-slate-500">
									Loading restrictions…
								</td>
							</tr>
						) : records.length ? (
							records.map((restriction) => (
								<tr key={restriction.id}>
									<td className="px-3 py-2 text-slate-700">{restriction.mode}</td>
									<td className="px-3 py-2 text-slate-600">{restriction.scope ?? "global"}</td>
									<td className="px-3 py-2 text-slate-600">{restriction.reason ?? "—"}</td>
									<td className="px-3 py-2 text-slate-500">{formatExpires(restriction.expires_at)}</td>
									<td className="px-3 py-2 text-slate-500">{restriction.created_by ?? "—"}</td>
									{canManage && view === "active" ? (
										<td className="px-3 py-2 text-right">
											<button
												type="button"
												onClick={() => onRevokeRestriction?.(restriction)}
												className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
											>
												Revoke
											</button>
										</td>
									) : null}
								</tr>
							))) : (
							<tr>
								<td colSpan={canManage && view === "active" ? 6 : 5} className="px-3 py-8 text-center text-sm text-slate-500">
									{view === "active" ? "No active restrictions." : "No historical restrictions."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}
