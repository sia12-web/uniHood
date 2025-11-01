"use client";

import { useState } from "react";

export type AuditExportField = "time" | "actor_id" | "action" | "target_type" | "target_id" | "meta";

export type ExportBarProps = {
	selectedFields: AuditExportField[];
	onFieldsChange: (fields: AuditExportField[]) => void;
	onExport: (format: "csv" | "ndjson", fields: AuditExportField[]) => void | Promise<void>;
	buildCurl: (format: "csv" | "ndjson", fields: AuditExportField[]) => string;
	disabled?: boolean;
	isExporting?: boolean;
};

const ALL_FIELDS: AuditExportField[] = ["time", "actor_id", "action", "target_type", "target_id", "meta"];

export function ExportBar({ selectedFields, onFieldsChange, onExport, buildCurl, disabled, isExporting }: ExportBarProps) {
	const [copiedFormat, setCopiedFormat] = useState<"csv" | "ndjson" | null>(null);

	const toggleField = (field: AuditExportField) => {
		onFieldsChange(selectedFields.includes(field) ? selectedFields.filter((item) => item !== field) : [...selectedFields, field]);
	};

	const copyCurl = async (format: "csv" | "ndjson") => {
		try {
			await navigator.clipboard.writeText(buildCurl(format, selectedFields));
			setCopiedFormat(format);
			setTimeout(() => setCopiedFormat(null), 2_000);
		} catch (error) {
			console.warn("Failed to copy cURL", error);
		}
	};

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
			<header className="mb-3 flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Export</h2>
				<p className="text-xs text-slate-500">CSV or NDJSON with selected fields</p>
			</header>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fields</h3>
					<div className="mt-2 flex flex-wrap gap-2">
						{ALL_FIELDS.map((field) => (
							<label key={field} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
								<input
									type="checkbox"
									checked={selectedFields.includes(field)}
									onChange={() => toggleField(field)}
									className="h-3 w-3 rounded border-slate-300"
								/>
								{field}
							</label>
						))}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => onExport("csv", selectedFields)}
						disabled={disabled || isExporting}
						className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
					>
						{isExporting ? "Exporting…" : "Export CSV"}
					</button>
					<button
						type="button"
						onClick={() => onExport("ndjson", selectedFields)}
						disabled={disabled || isExporting}
						className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isExporting ? "Exporting…" : "Export NDJSON"}
					</button>
					<button
						type="button"
						onClick={() => copyCurl("ndjson")}
						className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-300"
					>
						{copiedFormat === "ndjson" ? "Copied" : "Copy cURL"}
					</button>
				</div>
			</div>
		</section>
	);
}
