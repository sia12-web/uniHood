"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BundleExportForm } from "@/components/mod/tools/bundle-export-form";
import { BundleImportWizard } from "@/components/mod/tools/bundle-import-wizard";
import { ToolJobDetailCard } from "@/components/mod/tools/tool-job-detail";
import { ToolJobList } from "@/components/mod/tools/tool-job-list";
import { useBundleCatalog, useBundleExport, useBundleImport, type BundleImportRequest, type BundleImportResponse } from "@/hooks/mod/tools/use-bundles";
import { useJobDetail, useJobsList, useJobsSocket } from "@/hooks/mod/tools/use-jobs";

export function BundlesClient() {
	const catalog = useBundleCatalog();
	const exportMutation = useBundleExport();
	const importMutation = useBundleImport();
	const jobs = useJobsList({ limit: 25 });
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

	const jobItems = useMemo(() => {
		const items = jobs.data?.items ?? [];
		const scoped = items.filter((job) => job.type.includes("bundle"));
		return scoped.length ? scoped : items;
	}, [jobs.data?.items]);

	useEffect(() => {
		if (!selectedJobId && jobItems.length) {
			setSelectedJobId(jobItems[0].id);
		}
	}, [jobItems, selectedJobId]);

	const jobDetail = useJobDetail(selectedJobId);
	useJobsSocket(selectedJobId);

	const handleExport = useCallback(
		(keys: string[]) => {
			if (!keys.length) return;
			exportMutation.mutate({ keys });
		},
		[exportMutation],
	);

	const handleImport = useCallback(
		async (payload: BundleImportRequest): Promise<BundleImportResponse> => {
			const result = await importMutation.mutateAsync(payload);
			if (!payload.dry_run && result.job_id) {
				setSelectedJobId(result.job_id);
				void jobs.refetch();
			}
			return result;
		},
		[importMutation, jobs],
	);

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold text-slate-900">Bundles</h1>
				<p className="text-sm text-slate-600">Export guard presets or import new bundles with dry-run safeguards.</p>
			</header>

			<div className="grid gap-6 xl:grid-cols-2">
				<BundleExportForm
					availableKeys={catalog.data?.available_keys ?? []}
					onExport={handleExport}
					pending={exportMutation.isPending}
				/>
				<BundleImportWizard onSubmit={handleImport} pending={importMutation.isPending} />
			</div>

			<section className="grid gap-6 lg:grid-cols-[2fr_3fr]">
				<ToolJobList jobs={jobItems} loading={jobs.isFetching} selectedJobId={selectedJobId} onSelect={(id) => setSelectedJobId(id)} />
				<ToolJobDetailCard job={jobDetail.data ?? null} />
			</section>
		</div>
	);
}
