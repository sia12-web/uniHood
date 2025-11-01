"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ExplorerFilters } from "@/components/mod/audit/explorer-filters";
import { ExplorerTable } from "@/components/mod/audit/explorer-table";
import { ExportBar, type AuditExportField } from "@/components/mod/audit/export-bar";
import { SavedSearches } from "@/components/mod/audit/saved-searches";
import { StatsStrip } from "@/components/mod/audit/stats-strip";
import { useAuditList, flattenAuditPages, type AuditQuery } from "@/hooks/mod/audit/use-audit-list";
import { useAuditExport } from "@/hooks/mod/audit/use-audit-export";
import { useAuditSavedSearches } from "@/hooks/mod/audit/use-audit-saved";
import { useStaffIdentity } from "@/components/providers/staff-provider";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_EXPORT_FIELDS: AuditExportField[] = ["time", "actor_id", "action", "target_type", "target_id", "meta"];

function parseSearchParams(params: URLSearchParams): AuditQuery {
	const actions = params.getAll("action");
	const singleAction = params.get("action");
	return {
		target_type: params.get("target_type") ?? undefined,
		target_id: params.get("target_id") ?? undefined,
		actor_id: params.get("actor_id") ?? undefined,
		action: actions.length ? actions : singleAction ? [singleAction] : undefined,
		from: params.get("from") ?? undefined,
		to: params.get("to") ?? undefined,
		q: params.get("q") ?? undefined,
	};
}

function buildSearchParams(query: AuditQuery): URLSearchParams {
	const params = new URLSearchParams();
	if (query.target_type) params.set("target_type", query.target_type);
	if (query.target_id) params.set("target_id", query.target_id);
	if (query.actor_id) params.set("actor_id", query.actor_id);
	if (query.from) params.set("from", query.from);
	if (query.to) params.set("to", query.to);
	if (query.q) params.set("q", query.q);
	if (query.action?.length) {
		query.action.forEach((action) => params.append("action", action));
	}
	return params;
}

function queriesEqual(left: AuditQuery, right: AuditQuery): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export default function AuditExplorerPage() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const initialQuery = useMemo(() => parseSearchParams(searchParams), [searchParams]);
	const [draft, setDraft] = useState<AuditQuery>(initialQuery);
	const [activeQuery, setActiveQuery] = useState<AuditQuery>(initialQuery);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [exportFields, setExportFields] = useState<AuditExportField[]>(DEFAULT_EXPORT_FIELDS);
	const { saved, saveSearch, removeSearch, renameSearch } = useAuditSavedSearches();
	const { profile } = useStaffIdentity();
	const { push } = useToast();

	const isAdmin = useMemo(() => profile.scopes?.some((scope) => scope === "staff.admin"), [profile.scopes]);

	const listQuery = useAuditList(activeQuery);
	const events = flattenAuditPages(listQuery.data?.pages);

	const { exportAudit, isExporting, buildCurl } = useAuditExport(activeQuery);

	useEffect(() => {
		if (queriesEqual(initialQuery, draft) && queriesEqual(initialQuery, activeQuery)) {
			return;
		}
		setDraft(initialQuery);
		setActiveQuery(initialQuery);
		}, [initialQuery, draft, activeQuery]);

	useEffect(() => {
		const params = buildSearchParams(activeQuery);
		const search = params.toString();
		router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
	}, [activeQuery, pathname, router]);

	const statsSource = listQuery.data?.pages?.[0];
	const stats = {
		count: events.length,
		estimated: statsSource?.estimated_total ?? statsSource?.total ?? null,
		ratePerMinute: statsSource?.events_per_minute ?? null,
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
				<div className="flex-1 space-y-4">
					<ExplorerFilters
						value={draft}
						onChange={setDraft}
						onSubmit={() => {
							setActiveQuery(draft);
							setExpandedId(null);
						}}
						onReset={() => {
							setDraft({});
							setActiveQuery({});
							setExpandedId(null);
						}}
						isLoading={listQuery.isPending}
					/>
					<ExplorerTable
						events={events}
						expandedId={expandedId}
						onToggleRow={(id) => setExpandedId((current) => (current === id ? null : id))}
						onLoadMore={listQuery.fetchNextPage}
						hasNextPage={listQuery.hasNextPage}
						isLoading={listQuery.isPending}
						isFetchingNext={listQuery.isFetchingNextPage}
						isAdmin={isAdmin}
					/>
				</div>
				<div className="flex w-full max-w-xs flex-col gap-4">
					<StatsStrip count={stats.count} estimated={stats.estimated ?? undefined} ratePerMinute={stats.ratePerMinute ?? undefined} />
					<SavedSearches
						searches={saved}
						onCreate={(name) => {
							saveSearch(name, draft);
							push({ title: "Search saved", variant: "success" });
						}}
						onSelect={(search) => {
							setDraft(search.query);
							setActiveQuery(search.query);
							setExpandedId(null);
							push({ title: "Saved search applied", description: search.name, variant: "default" });
						}}
						onDelete={(id) => removeSearch(id)}
						onRename={renameSearch}
					/>
					<ExportBar
						selectedFields={exportFields}
						onFieldsChange={setExportFields}
						onExport={async (format, fields) => {
							try {
								await exportAudit(format, fields);
								push({ title: `Export started (${format.toUpperCase()})`, variant: "success" });
							} catch (error) {
								push({ title: "Export failed", description: error instanceof Error ? error.message : undefined, variant: "error" });
							}
						}}
						buildCurl={(format, fields) => buildCurl(format, fields)}
						disabled={!events.length}
						isExporting={isExporting}
					/>
				</div>
			</div>
		</div>
	);
}
