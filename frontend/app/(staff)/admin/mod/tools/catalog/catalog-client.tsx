"use client";

import { useMemo, useState } from "react";

import { CatalogTable } from "@/components/mod/tools/catalog-table";
import { CreateActionDialog } from "@/components/mod/tools/create-action-dialog";
import { useActionsCatalog, useCreateToolAction, useDeactivateToolAction, useToolActionDetails } from "@/hooks/mod/tools/use-catalog";

export function CatalogClient() {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selected, setSelected] = useState<{ key: string; version: number } | null>(null);

	const catalog = useActionsCatalog();
	const createMutation = useCreateToolAction();
	const deactivate = useDeactivateToolAction();
	const selectedAction = useMemo(() => {
		if (!selected) return null;
		return catalog.data?.items.find((item) => item.key === selected.key && item.version === selected.version) ?? null;
	}, [catalog.data?.items, selected]);
	const detail = useToolActionDetails(selected?.key ?? null, selected?.version ?? null);

	return (
		<div className="space-y-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Actions catalog</h1>
					<p className="text-sm text-slate-600">Review registered actions or add new ones. Deactivations happen immediately.</p>
				</div>
				<button
					type="button"
					onClick={() => setDialogOpen(true)}
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
				>
					New action
				</button>
			</header>

			<CatalogTable
				actions={catalog.data?.items ?? []}
				loading={catalog.isFetching}
				onInspect={(action) => setSelected({ key: action.key, version: action.version })}
				onDeactivate={(action) => deactivate.mutate({ key: action.key, version: action.version })}
			/>

			{selectedAction ? (
				<section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
					<header className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-lg font-semibold text-slate-900">{selectedAction.key}@{selectedAction.version}</h2>
							<p className="text-sm text-slate-600">Created {new Date(selectedAction.created_at).toLocaleString()}</p>
						</div>
						<button
							type="button"
							onClick={() => setSelected(null)}
							className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
						>
							Close
						</button>
					</header>
					{selectedAction.summary ? <p className="text-sm text-slate-600">{selectedAction.summary}</p> : null}
					{detail.data ? (
						<pre className="max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-900/5 p-4 text-xs text-slate-700">
							{JSON.stringify(detail.data, null, 2)}
						</pre>
					) : (
						<p className="text-sm text-slate-500">Loading spec…</p>
					)}
				</section>
			) : null}

			<CreateActionDialog
				open={dialogOpen}
				loading={createMutation.isPending}
				onDismiss={() => setDialogOpen(false)}
				onCreate={(payload) => {
					createMutation.mutate(payload, {
						onSuccess: () => setDialogOpen(false),
					});
				}}
			/>
		</div>
	);
}
