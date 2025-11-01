"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type ToolActionKind = "atomic" | "macro";

export type ToolActionRecord = {
	key: string;
	version: number;
	kind: ToolActionKind;
	active: boolean;
	description?: string | null;
	created_at: string;
	created_by?: string | null;
	summary?: string | null;
};

export type ToolActionListResponse = {
	items: ToolActionRecord[];
	total: number;
};

export type CreateToolActionPayload = {
	key: string;
	version: number;
	kind: ToolActionKind;
	spec: unknown;
	description?: string;
};

export type CreateToolActionResponse = {
	action: ToolActionRecord;
};

export function useActionsCatalog() {
	return useQuery<ToolActionListResponse>({
		queryKey: ["tools:catalog"],
		staleTime: 30_000,
		queryFn: async () => {
			const res = await modApi.get<ToolActionListResponse>("/tools/actions");
			return res.data;
		},
	});
}

export function useCreateToolAction() {
	const toast = useToast();
	const qc = useQueryClient();
	return useMutation<CreateToolActionResponse, unknown, CreateToolActionPayload>({
		mutationFn: async (payload) => {
			const res = await modApi.post<CreateToolActionResponse>("/tools/actions", payload);
			return res.data;
		},
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: ["tools:catalog"] });
			emitSafetyMetric({ event: "ui_tools_catalog_create_total" });
			toast.push({
				id: "catalog-create-success",
				title: "Action created",
				description: `${data.action.key}@${data.action.version} is now available`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to create action";
			toast.push({ id: "catalog-create-error", title: "Create failed", description, variant: "error" });
		},
	});
}

export function useDeactivateToolAction() {
	const toast = useToast();
	const qc = useQueryClient();
	return useMutation<{ success: boolean }, unknown, { key: string; version: number }>({
		mutationFn: async ({ key, version }) => {
			const res = await modApi.post<{ success: boolean }>(`/tools/actions/${encodeURIComponent(key)}/${version}/deactivate`);
			return res.data;
		},
		onSuccess: (_, variables) => {
			qc.invalidateQueries({ queryKey: ["tools:catalog"] });
			toast.push({
				id: "catalog-deactivate-success",
				title: "Action deactivated",
				description: `${variables.key}@${variables.version} disabled`,
				variant: "success",
			});
		},
		onError: (error, variables) => {
			const description = error instanceof Error ? error.message : "Unable to deactivate action";
			toast.push({ id: "catalog-deactivate-error", title: "Deactivate failed", description, variant: "error" });
		},
	});
}

export function useToolActionDetails(key: string | null, version: number | null) {
	return useQuery<ToolActionRecord | null>({
		queryKey: ["tools:catalog", "detail", key, version],
		enabled: Boolean(key && version != null),
		staleTime: 30_000,
		queryFn: async () => {
			if (!key || version == null) return null;
			const res = await modApi.get<ToolActionRecord>(`/tools/actions/${encodeURIComponent(key)}/${version}`);
			return res.data;
		},
	});
}
