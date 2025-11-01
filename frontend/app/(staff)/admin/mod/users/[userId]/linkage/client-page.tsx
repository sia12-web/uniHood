"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { LinkageFiltersBar } from "@/components/mod/linkage/filters";
import { LinkageGraph } from "@/components/mod/linkage/graph";
import { LinkageLegend } from "@/components/mod/linkage/legend";
import { LinkageTable } from "@/components/mod/linkage/table";
import { useLinkage, type LinkageFilters } from "@/hooks/mod/linkage/use-linkage";
import { useLinkageGraph } from "@/hooks/mod/linkage/use-linkage-graph";
import { useMacroRunner } from "@/hooks/mod/use-macro";
import { useToast } from "@/hooks/use-toast";
import { emitSafetyMetric } from "@/lib/obs/safety";

const MACRO_PRESETS = [
	{ id: "mass_shadow@1", label: "Shadow restrict selection" },
	{ id: "flag_review@1", label: "Flag for manual review" },
];

export type LinkageClientProps = {
	userId: string;
	isAdmin: boolean;
	campuses: string[];
};

export function LinkageClient({ userId, isAdmin, campuses }: LinkageClientProps) {
	const router = useRouter();
	const toast = useToast();
	const [filters, setFilters] = useState<LinkageFilters>({});
	const [listView, setListView] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const { execute } = useMacroRunner();

	const linkage = useLinkage(userId, filters);
	const graph = useLinkageGraph(linkage.data);

	useEffect(() => {
		emitSafetyMetric({ event: "linkage_open", userId });
	}, [userId]);

	useEffect(() => {
		if ((linkage.data?.peers?.length ?? 0) > 150) {
			setListView(true);
		}
	}, [linkage.data?.peers?.length]);

	const handleOpenUser = (nextId: string) => {
		router.push(`/admin/mod/users/${nextId}`);
	};

	const toggleSelect = (nextId: string) => {
		setSelected((prev) => (prev.includes(nextId) ? prev.filter((id) => id !== nextId) : [...prev, nextId]));
	};

	const peers = useMemo(() => linkage.data?.peers ?? [], [linkage.data?.peers]);
	const canSelect = isAdmin && peers.length > 0;

	const summary = useMemo(() => {
		return {
			relations: peers.reduce<Record<string, number>>((acc, peer) => {
				peer.relations.forEach((relation) => {
					acc[relation.relation] = (acc[relation.relation] ?? 0) + 1;
				});
				return acc;
			}, {}),
			count: peers.length,
		};
	}, [peers]);

	const handleMacro = async (macroId: string) => {
		if (!isAdmin || !macroId) return;
		if (!selected.length) {
			toast.push({ id: "linkage-macro-none", title: "Select accounts", description: "Choose linked accounts to target", variant: "warning" });
			return;
		}
		try {
			await execute.mutateAsync({
				macro: macroId,
				selector: { kind: "subjects", subject_type: "user", ids: selected },
			});
			toast.push({
				id: "linkage-macro-queued",
				title: "Macro queued",
				description: `${macroId} scheduled for ${selected.length} accounts`,
				variant: "success",
			});
		} catch (error) {
			const description = error instanceof Error ? error.message : "Unable to run macro";
			toast.push({ id: "linkage-macro-error", title: "Macro failed", description, variant: "error" });
		}
	};

	const loading = linkage.isLoading;
	const error = linkage.error instanceof Error ? linkage.error.message : null;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h2 className="text-xl font-semibold text-slate-900">Linkage graph</h2>
						<p className="text-sm text-slate-500">Explore shared devices, IP clusters, and related accounts.</p>
					</div>
					{isAdmin ? (
						<select
							defaultValue=""
							onChange={(event) => handleMacro(event.target.value)}
							disabled={!selected.length || execute.isPending}
							className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
							aria-label="Run macro on selected"
						>
							<option value="">Run macro…</option>
							{MACRO_PRESETS.map((macro) => (
								<option key={macro.id} value={macro.id}>
									{macro.label}
								</option>
							))}
						</select>
					) : null}
				</div>
				<LinkageFiltersBar filters={filters} campuses={campuses} onChange={setFilters} listView={listView} onToggleListView={setListView} />
				<LinkageLegend />
				{error ? (
					<p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
				) : null}
				{loading ? (
					<div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
				) : listView ? (
					<LinkageTable
						data={linkage.data}
						selected={selected}
						onToggleSelect={canSelect ? toggleSelect : undefined}
						onOpenUser={handleOpenUser}
						canSelect={canSelect}
					/>
				) : (
					<LinkageGraph
						nodes={graph.nodes}
						edges={graph.edges}
						onSelectNode={handleOpenUser}
					/>
				)}
			</div>
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h3 className="text-base font-semibold text-slate-900">Summary</h3>
				<p className="text-sm text-slate-500">{summary.count} linked accounts.</p>
				<ul className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
					{Object.entries(summary.relations).map(([relation, count]) => (
						<li key={relation} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
							<span className="font-semibold text-slate-800">{count}</span> {relation}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
