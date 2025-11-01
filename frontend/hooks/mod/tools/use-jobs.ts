"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { getStaffSocket } from "@/lib/sockets-staff";

export type ToolJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ToolJobRecord = {
	id: string;
	type: string;
	status: ToolJobStatus;
	dry_run: boolean;
	total?: number | null;
	succeeded?: number | null;
	failed?: number | null;
	started_at?: string | null;
	finished_at?: string | null;
	initiated_by?: string | null;
};

export type ToolJobListResponse = {
	items: ToolJobRecord[];
	next_cursor?: string | null;
};

export type ToolJobResultItem = {
	target: string;
	ok: boolean;
	message?: string | null;
	data?: Record<string, unknown> | null;
};

export type ToolJobDetail = ToolJobRecord & {
	progress?: {
		total: number | null;
		succeeded: number | null;
		failed: number | null;
	};
	results?: ToolJobResultItem[];
	ndjson_url?: string | null;
};

export function useJobsList(params: { after?: string | null; limit?: number } = {}) {
	return useQuery<ToolJobListResponse>({
		queryKey: ["tools:jobs", params.after ?? null, params.limit ?? null],
		staleTime: 10_000,
		queryFn: async () => {
			const res = await modApi.get<ToolJobListResponse>("/tools/jobs", {
				params: {
					after: params.after ?? undefined,
					limit: params.limit ?? undefined,
				},
			});
			return res.data;
		},
	});
}

export function useJobDetail(jobId: string | null) {
	return useQuery<ToolJobDetail>({
		queryKey: ["tools:job", jobId],
		enabled: Boolean(jobId),
		staleTime: 5_000,
		queryFn: async () => {
			if (!jobId) throw new Error("jobId required");
			const res = await modApi.get<ToolJobDetail>(`/tools/jobs/${jobId}`);
			return res.data;
		},
	});
}

export function useJobsSocket(jobId?: string | null) {
	const qc = useQueryClient();

	useEffect(() => {
		const socket = getStaffSocket();

		const handleUpdate = (payload: ToolJobDetail) => {
			qc.setQueryData<ToolJobDetail | undefined>(["tools:job", payload.id], (previous) => ({
				...previous,
				...payload,
			}));
			qc.invalidateQueries({ queryKey: ["tools:jobs"] });
		};

		socket.on("job.updated", handleUpdate);
		socket.on("job.completed", handleUpdate);

		return () => {
			socket.off("job.updated", handleUpdate);
			socket.off("job.completed", handleUpdate);
		};
	}, [jobId, qc]);
}
