"use client";

import { useCallback, useMemo, useState } from "react";

import { modApi } from "@/lib/api-mod";
import { buildCurlCommand, downloadBlob } from "@/lib/download";

import type { AuditQuery } from "./use-audit-list";
import { buildAuditQueryParams } from "./use-audit-list";

type ExportFormat = "csv" | "ndjson";

type UseAuditExportResult = {
	exportAudit: (format: ExportFormat, fields?: string[]) => Promise<void>;
	isExporting: boolean;
	error: Error | null;
	buildCurl: (format: ExportFormat, fields?: string[]) => string;
};

const EXPORT_ENDPOINT = "/admin/audit";

export function useAuditExport(query: AuditQuery): UseAuditExportResult {
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const baseParams = useMemo(() => buildAuditQueryParams(query), [query]);

	const exportAudit = useCallback(
		async (format: ExportFormat, fields?: string[]) => {
			setIsExporting(true);
			setError(null);
			try {
				const headers = format === "csv" ? { Accept: "text/csv" } : { Accept: "application/x-ndjson" };
				const params = {
					...baseParams,
					ndjson: format === "ndjson" ? 1 : undefined,
					fields: fields?.length ? fields.join(",") : undefined,
				};
				const response = await modApi.get<Blob>(EXPORT_ENDPOINT, {
					params,
					headers,
					responseType: "blob",
				});
				downloadBlob(response.data, `audit-${Date.now()}.${format}`);
			} catch (caught) {
				const err = caught instanceof Error ? caught : new Error("Failed to export audit logs");
				setError(err);
				throw err;
			} finally {
				setIsExporting(false);
			}
		},
		[baseParams],
	);

	const buildCurl = useCallback(
		(format: ExportFormat, fields?: string[]) => {
			const headers = format === "csv" ? { Accept: "text/csv" } : { Accept: "application/x-ndjson" };
			const params = {
				...baseParams,
				ndjson: format === "ndjson" ? 1 : undefined,
				fields: fields?.length ? fields.join(",") : undefined,
			};
			return buildCurlCommand(EXPORT_ENDPOINT, params, headers);
		},
		[baseParams],
	);

	return { exportAudit, isExporting, error, buildCurl };
}
