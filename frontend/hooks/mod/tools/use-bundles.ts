"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";
import type { ToolActionListResponse } from "@/hooks/mod/tools/use-catalog";

export type BundleCatalogResponse = {
	available_keys: string[];
};

export type BundleExportRequest = {
	keys: string[];
};

export type BundleImportRequest = {
	contents: string;
	dry_run?: boolean;
};

export type BundleImportResponse = {
	dry_run: boolean;
	created: number;
	updated: number;
	unchanged: number;
	hmac_valid: boolean;
	job_id?: string;
};

export function useBundleCatalog() {
	return useQuery<BundleCatalogResponse>({
		queryKey: ["tools:bundles", "catalog"],
		staleTime: 30_000,
		queryFn: async () => {
			const res = await modApi.get<ToolActionListResponse>("/tools/actions");
			const keys = res.data.items.map((item) => item.key);
			return { available_keys: keys };
		},
	});
}

export function useBundleExport() {
	const toast = useToast();
	return useMutation<Blob, unknown, BundleExportRequest>({
		mutationFn: async ({ keys }) => {
			const res = await modApi.get<Blob>("/tools/actions/export.yml", {
				params: { keys: keys.join(",") },
				responseType: "blob",
			});
			return res.data;
		},
		onSuccess: (blob, variables) => {
			const filename = variables.keys.length === 1 ? `${variables.keys[0]}.yml` : `tools-export-${Date.now()}.yml`;
			if (typeof window !== "undefined") {
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = filename;
				document.body.appendChild(link);
				link.click();
				link.remove();
				URL.revokeObjectURL(url);
			}
			toast.push({ id: "bundle-export-success", title: "Export ready", description: `${variables.keys.length} actions downloaded`, variant: "success" });
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to export bundle";
			toast.push({ id: "bundle-export-error", title: "Export failed", description, variant: "error" });
		},
	});
}

export function useBundleImport() {
	const toast = useToast();
	return useMutation<BundleImportResponse, unknown, BundleImportRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<BundleImportResponse>("/tools/run/bundle_import", payload);
			return res.data;
		},
		onSuccess: (data) => {
			emitSafetyMetric({ event: "ui_tools_bundle_import_total", mode: data.dry_run ? "dry_run" : "execute" });
			const description = data.dry_run
				? `${data.created} create / ${data.updated} update / ${data.unchanged} unchanged`
				: `Import enqueued${data.job_id ? ` as ${data.job_id}` : ""}`;
			toast.push({ id: "bundle-import-success", title: data.dry_run ? "Dry-run complete" : "Bundle imported", description, variant: "success" });
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to import bundle";
			toast.push({ id: "bundle-import-error", title: "Import failed", description, variant: "error" });
		},
	});
}
