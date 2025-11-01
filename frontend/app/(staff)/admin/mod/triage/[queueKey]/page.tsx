"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CaseDrawer } from "@/components/mod/triage/case-drawer";
import { KeyboardHelp } from "@/components/mod/triage/keyboard-help";
import type { QueueDefinition } from "@/components/mod/triage/queues-sidebar";
import { QueuesSidebar } from "@/components/mod/triage/queues-sidebar";
import { QueueTable } from "@/components/mod/triage/queue-table";
import type { CaseActionType } from "@/hooks/mod/triage/use-case-actions";
import type { CaseSummary } from "@/hooks/mod/triage/use-queue";
import { useQueue } from "@/hooks/mod/triage/use-queue";
import { useQueueSummaries } from "@/hooks/mod/triage/use-queue-summaries";
import { useCaseActions } from "@/hooks/mod/triage/use-case-actions";
import { useStaffIdentity } from "@/components/providers/staff-provider";
import { emitSafetyMetric } from "@/lib/obs/safety";

const CUSTOM_QUEUE_STORAGE_PREFIX = "triage:queue:";

const QUEUE_TEMPLATES: Array<{ key: string; label: string; description: string }> = [
	{ key: "sev4", label: "Severity 4+", description: "Open cases severity ≥ 4" },
	{ key: "new-24h", label: "New · 24h", description: "Created within last 24 hours" },
	{ key: "appeals-pending", label: "Appeals", description: "Appeal-ready cases" },
	{ key: "unassigned", label: "Unassigned", description: "No active moderator" },
	{ key: "my-claimed", label: "My claimed", description: "Cases assigned to me" },
	{ key: "escalated", label: "Escalated", description: "Escalated > 0" },
	{ key: "quarantine-handoff", label: "Quarantine", description: "Quarantine handoffs" },
];

type CustomQueueDefinition = {
	key: string;
	label: string;
	description: string;
	filtersRecord: Record<string, string>;
	filtersString: string;
};

type PageProps = {
	params: { queueKey: string };
};

function parseStoredQueue(key: string, value: string): CustomQueueDefinition {
	let filtersString = value;
	let label: string | undefined;
	try {
		const parsed = JSON.parse(value) as { filters?: string; label?: string } | undefined;
		if (parsed && typeof parsed === "object") {
			if (typeof parsed.filters === "string") filtersString = parsed.filters;
			if (typeof parsed.label === "string") label = parsed.label;
		}
	} catch {
		// legacy plain string storage
	}
	const params = new URLSearchParams(filtersString);
	const filtersRecord: Record<string, string> = {};
	params.forEach((paramValue, paramKey) => {
		filtersRecord[paramKey] = paramValue;
	});
	const descriptionParts = Array.from(params.entries())
		.slice(0, 3)
		.map(([paramKey, paramValue]) => `${paramKey}=${paramValue}`);
	const descriptor = descriptionParts.length ? descriptionParts.join(", ") : "Custom filters";
	const displayLabel = label && label.trim().length ? label : `Custom ${key.slice(-4)}`;
	return {
		key,
		label: displayLabel,
		description: descriptor,
		filtersRecord,
		filtersString: params.toString(),
	};
}

function describeFilters(params: URLSearchParams): string {
	const parts = Array.from(params.entries()).map(([key, value]) => `${key}=${value}`);
	return parts.slice(0, 3).join(", ") || "Custom filters";
}

export default function TriageQueuePage({ params }: PageProps) {
	const router = useRouter();
	const { profile } = useStaffIdentity();
	const queueKey = params.queueKey ?? "sev4";

	const [customQueues, setCustomQueues] = useState<CustomQueueDefinition[]>([]);
	const [customFilters, setCustomFilters] = useState<Record<string, string> | undefined>(undefined);
	const [customReady, setCustomReady] = useState<boolean>(() => !queueKey.startsWith("custom-"));

	const [selected, setSelected] = useState<Record<string, boolean>>({});
	const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
	const [openCaseId, setOpenCaseId] = useState<string | null>(null);
	const [skipAfterAction, setSkipAfterAction] = useState<boolean>(true);
	const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

	const lastReported = useRef<{ queue: string; count: number } | null>(null);

	// Bootstrap saved skip preference.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const saved = window.localStorage.getItem("triage:skip-after-action");
		if (saved !== null) {
			setSkipAfterAction(saved === "true");
		}
	}, []);

	// Persist skip preference when updated.
	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem("triage:skip-after-action", skipAfterAction ? "true" : "false");
	}, [skipAfterAction]);

	// Load stored custom queues on mount.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const entries: CustomQueueDefinition[] = [];
		for (let index = 0; index < window.localStorage.length; index += 1) {
			const storageKey = window.localStorage.key(index);
			if (!storageKey || !storageKey.startsWith(CUSTOM_QUEUE_STORAGE_PREFIX)) continue;
			const queueId = storageKey.slice(CUSTOM_QUEUE_STORAGE_PREFIX.length);
			if (!queueId.startsWith("custom-")) continue;
			const value = window.localStorage.getItem(storageKey);
			if (!value) continue;
			entries.push(parseStoredQueue(queueId, value));
		}
		entries.sort((a, b) => a.label.localeCompare(b.label));
		setCustomQueues(entries);
	}, []);

	// Resolve custom filters for active queue.
	useEffect(() => {
		if (!queueKey.startsWith("custom-")) {
			setCustomFilters(undefined);
			setCustomReady(true);
			return;
		}
		if (typeof window === "undefined") return;
		setCustomReady(false);
		const storageKey = `${CUSTOM_QUEUE_STORAGE_PREFIX}${queueKey}`;
		const value = window.localStorage.getItem(storageKey);
		if (!value) {
			setCustomFilters({});
			setCustomReady(true);
			return;
		}
		const definition = parseStoredQueue(queueKey, value);
		setCustomFilters(definition.filtersRecord);
		setCustomQueues((current) => {
			if (current.some((item) => item.key === queueKey)) {
				return current;
			}
			return [...current, definition];
		});
		setCustomReady(true);
	}, [queueKey]);

	const queryInput = useMemo(() => {
		if (queueKey.startsWith("custom-")) {
			return { queueKey, filters: customFilters ?? {} };
		}
		return { queueKey };
	}, [queueKey, customFilters]);

	const summaryInputs = useMemo(() => {
		const base = QUEUE_TEMPLATES.map((template) => ({ key: template.key }));
		const customs = customQueues.map((queue) => ({ key: queue.key, filters: queue.filtersRecord }));
		return [...base, ...customs];
	}, [customQueues]);

	const summarySkipKeys = useMemo(() => {
		const set = new Set<string>();
		if (queueKey) {
			set.add(queueKey);
		}
		return set;
	}, [queueKey]);

	const summaryResults = useQueueSummaries(summaryInputs, { skipKeys: summarySkipKeys });

	const summaryMetrics = useMemo(() => {
		const map = new Map<string, { count: number | null; slaBreaches: number | null }>();
		summaryResults.forEach((result, index) => {
			const entry = summaryInputs[index];
			if (!entry) {
				return;
			}
			if (result.status === "success" && result.data) {
				map.set(result.data.key, { count: result.data.count, slaBreaches: result.data.slaBreaches });
			}
		});
		return map;
	}, [summaryResults, summaryInputs]);

	const {
		data,
		error,
		isLoading,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useQueue(queryInput, { enabled: customReady });

	const cases = useMemo<CaseSummary[]>(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
	const total = data?.pages?.[0]?.total ?? null;

	const openCase = useMemo(() => (openCaseId ? cases.find((item) => item.id === openCaseId) ?? null : null), [cases, openCaseId]);
	const activeIndex = useMemo(() => {
		if (!cases.length) return -1;
		if (!activeCaseId) return 0;
		const idx = cases.findIndex((item) => item.id === activeCaseId);
		return idx >= 0 ? idx : 0;
	}, [cases, activeCaseId]);
	const currentCase = activeIndex >= 0 ? cases[activeIndex] ?? null : null;

	const activeMetrics = useMemo(() => {
		const count = total ?? cases.length;
		const slaBreaches = cases.reduce((totalBreaches, item) => {
			if (!item.sla_due_at) return totalBreaches;
			const due = Date.parse(item.sla_due_at);
			return Number.isFinite(due) && due < Date.now() ? totalBreaches + 1 : totalBreaches;
		}, 0);
		return { count, slaBreaches };
	}, [cases, total]);

	const metricsMap = useMemo(() => {
		const map = new Map(summaryMetrics);
		map.set(queueKey, activeMetrics);
		return map;
	}, [summaryMetrics, activeMetrics, queueKey]);

	useEffect(() => {
		if (!cases.length) {
			setActiveCaseId(null);
			return;
		}
		if (!activeCaseId || !cases.some((item) => item.id === activeCaseId)) {
			setActiveCaseId(cases[0].id);
		}
	}, [cases, activeCaseId]);

	useEffect(() => {
		if (openCaseId && !cases.some((item) => item.id === openCaseId)) {
			setOpenCaseId(null);
		}
	}, [cases, openCaseId]);

	useEffect(() => {
		const activeIds = new Set(cases.map((item) => item.id));
		setSelected((current) => {
			const next: Record<string, boolean> = {};
			Object.keys(current).forEach((id) => {
				if (current[id] && activeIds.has(id)) {
					next[id] = true;
				}
			});
			return Object.keys(next).length === Object.keys(current).length ? current : next;
		});
	}, [cases]);

	const handleToggleSelect = useCallback((caseId: string) => {
		setSelected((current) => {
			const next = { ...current };
			if (next[caseId]) {
				delete next[caseId];
			} else {
				next[caseId] = true;
			}
			return next;
		});
	}, []);

	const handleSelectAll = useCallback(
		(checked: boolean) => {
			if (!checked) {
				setSelected({});
				return;
			}
			const next: Record<string, boolean> = {};
			cases.forEach((item) => {
				next[item.id] = true;
			});
			setSelected(next);
		},
		[cases],
	);

	const handleOpenCase = useCallback(
		(caseItem: CaseSummary) => {
			setOpenCaseId(caseItem.id);
			setActiveCaseId(caseItem.id);
		},
		[],
	);

	const handleCloseDrawer = useCallback(() => setOpenCaseId(null), []);

	const handleToggleSkip = useCallback(() => {
		setSkipAfterAction((value) => !value);
	}, []);

	const handleCreateCustom = useCallback(
		(filtersInput: string) => {
			const trimmed = filtersInput.trim();
			if (!trimmed) return;
			const params = new URLSearchParams();
			for (const segment of trimmed.split("&")) {
				const [rawKey, rawValue = ""] = segment.split("=");
				const keyPart = rawKey?.trim();
				if (!keyPart) continue;
				params.append(keyPart, rawValue.trim());
			}
			if (!params.toString()) return;
			const queueId = `custom-${Date.now().toString(36)}`;
			const label = trimmed.length <= 40 ? trimmed : describeFilters(params);
			const filtersString = params.toString();
			const storageValue = JSON.stringify({ filters: filtersString, label });
			if (typeof window !== "undefined") {
				window.localStorage.setItem(`${CUSTOM_QUEUE_STORAGE_PREFIX}${queueId}`, storageValue);
			}
			const filtersRecord = Object.fromEntries(params.entries());
			const definition: CustomQueueDefinition = {
				key: queueId,
				label,
				description: describeFilters(params),
				filtersRecord,
				filtersString,
			};
			setCustomQueues((current) => (current.some((item) => item.key === queueId) ? current : [...current, definition]));
			router.push(`/admin/mod/triage/${queueId}`);
		},
		[router],
	);

	const handleRenameCustom = useCallback(
		(targetKey: string) => {
			const target = customQueues.find((item) => item.key === targetKey);
			if (!target) {
				return;
			}
			const next = window.prompt("Rename queue", target.label);
			if (!next) {
				return;
			}
			const trimmed = next.trim();
			if (!trimmed || trimmed === target.label) {
				return;
			}
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					`${CUSTOM_QUEUE_STORAGE_PREFIX}${targetKey}`,
					JSON.stringify({ filters: target.filtersString, label: trimmed }),
				);
			}
			setCustomQueues((current) =>
				current.map((item) => (item.key === targetKey ? { ...item, label: trimmed } : item)),
			);
		},
		[customQueues],
	);

	const handleDeleteCustom = useCallback(
		(targetKey: string) => {
			const target = customQueues.find((item) => item.key === targetKey);
			if (!target) {
				return;
			}
			const confirmed = window.confirm(`Delete queue "${target.label}"?`);
			if (!confirmed) {
				return;
			}
			if (typeof window !== "undefined") {
				window.localStorage.removeItem(`${CUSTOM_QUEUE_STORAGE_PREFIX}${targetKey}`);
			}
			setCustomQueues((current) => current.filter((item) => item.key !== targetKey));
			if (queueKey === targetKey) {
				router.push("/admin/mod/triage/sev4");
			}
		},
		[customQueues, queueKey, router],
	);

	const handleActionComplete = useCallback(
		(action: CaseActionType, caseId: string) => {
			setSelected((current) => {
				if (!current[caseId]) return current;
				const next = { ...current };
				delete next[caseId];
				return next;
			});
			if (!skipAfterAction) {
				return;
			}
			const index = cases.findIndex((item) => item.id === caseId);
			const nextCase = index >= 0 && index + 1 < cases.length ? cases[index + 1] : null;
			if (nextCase) {
				setActiveCaseId(nextCase.id);
				setOpenCaseId(nextCase.id);
			} else {
				setOpenCaseId((current) => (current === caseId ? null : current));
			}
		},
		[cases, skipAfterAction],
	);

	const { mutateAsync: runShortcutAction, isPending: shortcutPending } = useCaseActions();

	const runActionViaShortcut = useCallback(
		async (action: CaseActionType) => {
			const target = openCase ?? currentCase;
			if (!target || shortcutPending) return;
			const payload = action === "assign" ? { moderator_id: profile.id } : undefined;
			try {
				await runShortcutAction({ caseId: target.id, type: action, payload });
				emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: action });
				handleActionComplete(action, target.id);
			} catch (mutationError) {
				console.error("Shortcut action failed", mutationError);
			}
		},
		[currentCase, openCase, shortcutPending, runShortcutAction, profile.id, handleActionComplete],
	);

	useEffect(() => {
		function handleKey(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
				return;
			}
			const key = event.key.toLowerCase();
			switch (key) {
				case "j": {
					event.preventDefault();
					if (!cases.length) return;
					const nextIndex = Math.min(activeIndex + 1, cases.length - 1);
					setActiveCaseId(cases[nextIndex].id);
					emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "j" });
					break;
				}
				case "k": {
					event.preventDefault();
					if (!cases.length) return;
					const nextIndex = Math.max(activeIndex - 1, 0);
					setActiveCaseId(cases[nextIndex].id);
					emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "k" });
					break;
				}
				case "enter": {
					event.preventDefault();
					const candidate = openCase ?? currentCase;
					if (candidate) {
						setOpenCaseId(candidate.id);
						emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "enter" });
					}
					break;
				}
				case "a":
				case "e":
				case "d":
				case "t":
				case "r": {
					event.preventDefault();
					const actionMap: Record<string, CaseActionType> = {
						a: "assign",
						e: "escalate",
						d: "dismiss",
						t: "tombstone",
						r: "remove",
					};
					void runActionViaShortcut(actionMap[key]);
					break;
				}
				case "m": {
					event.preventDefault();
					const candidate = openCase ?? currentCase;
					if (candidate) {
						setOpenCaseId(candidate.id);
						setTimeout(() => {
							const macroButtons = document.querySelector("[data-triage-macro]") as HTMLElement | null;
							if (macroButtons) {
								macroButtons.focus();
							}
						}, 50);
						emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "m" });
					}
					break;
				}
				case "n": {
					event.preventDefault();
					const candidate = openCase ?? currentCase;
					if (candidate) {
						setOpenCaseId(candidate.id);
						setTimeout(() => {
							const noteInput = document.getElementById("quick-note-input") as HTMLTextAreaElement | null;
							if (noteInput) {
								noteInput.focus();
								noteInput.select();
							}
						}, 50);
						emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "n" });
					}
					break;
				}
				case "?":
				case "/": {
					if (event.shiftKey || key === "?") {
						event.preventDefault();
						setKeyboardHelpOpen((value) => !value);
						emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "?" });
					}
					break;
				}
				case "s": {
					event.preventDefault();
					setSkipAfterAction((value) => !value);
					emitSafetyMetric({ event: "ui_triage_keyboard_used_total", key: "s" });
					break;
				}
				default:
					break;
			}
		}
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [cases, activeIndex, currentCase, openCase, runActionViaShortcut]);

	useEffect(() => {
		const count = activeMetrics.count ?? 0;
		if (!lastReported.current || lastReported.current.queue !== queueKey || lastReported.current.count !== count) {
			emitSafetyMetric({ event: "ui_triage_queue_load_total", queue: queueKey, items: count });
			lastReported.current = { queue: queueKey, count };
		}
	}, [activeMetrics, queueKey]);

	const queueDefinitions = useMemo<QueueDefinition[]>(() => {
		const base = QUEUE_TEMPLATES.map<QueueDefinition>((template) => {
			const stats = metricsMap.get(template.key);
			return {
				key: template.key,
				label: template.label,
				description: template.description,
				count: stats?.count ?? null,
				slaBreaches: stats?.slaBreaches ?? null,
				isCustom: false,
			};
		});
		const customs = customQueues.map<QueueDefinition>((entry) => {
			const stats = metricsMap.get(entry.key);
			return {
				key: entry.key,
				label: entry.label,
				description: entry.description,
				count: stats?.count ?? null,
				slaBreaches: stats?.slaBreaches ?? null,
				isCustom: true,
			};
		});
		if (queueKey.startsWith("custom-") && !customQueues.some((item) => item.key === queueKey)) {
			const stats = metricsMap.get(queueKey);
			customs.push({
				key: queueKey,
				label: "Custom",
				description: "Saved queue",
				count: stats?.count ?? null,
				slaBreaches: stats?.slaBreaches ?? null,
				isCustom: true,
			});
		}
		return [...base, ...customs];
	}, [metricsMap, customQueues, queueKey]);

	const queueTitle = useMemo(() => {
		const template = queueDefinitions.find((item) => item.key === queueKey);
		return template?.label ?? queueKey;
	}, [queueDefinitions, queueKey]);

	const queueDescription = useMemo(() => {
		const template = queueDefinitions.find((item) => item.key === queueKey);
		return template?.description ?? "Saved queue";
	}, [queueDefinitions, queueKey]);

	if (!customReady) {
		return <p className="text-sm text-slate-500">Loading queue…</p>;
	}

	const queryError = error ? (error instanceof Error ? error.message : "Unable to load queue") : null;

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
			<QueuesSidebar
				queues={queueDefinitions}
				activeKey={queueKey}
				basePath="/admin/mod/triage"
				onCreateCustom={handleCreateCustom}
				onRenameQueue={handleRenameCustom}
				onDeleteQueue={handleDeleteCustom}
			/>
			<section className="flex-1 space-y-6">
				<header className="space-y-1">
					<h2 className="text-2xl font-semibold text-slate-900">{queueTitle}</h2>
					<p className="text-sm text-slate-600">{queueDescription}</p>
				</header>
				{queryError ? (
					<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{queryError}</div>
				) : null}
				<QueueTable
					cases={cases}
					selectedIds={selected}
					activeCaseId={activeCaseId}
					onToggleSelect={handleToggleSelect}
					onSelectAll={handleSelectAll}
					onOpenCase={handleOpenCase}
					isLoading={isLoading || isFetching}
					hasNextPage={Boolean(hasNextPage)}
					onLoadMore={() => void fetchNextPage()}
					isFetchingMore={isFetchingNextPage}
				/>
			</section>
			<CaseDrawer
				open={Boolean(openCaseId)}
				caseId={openCaseId}
				summary={openCase}
				onClose={handleCloseDrawer}
				onActionComplete={handleActionComplete}
				skipAfterAction={skipAfterAction}
				onToggleSkip={handleToggleSkip}
				onOpenShortcuts={() => setKeyboardHelpOpen(true)}
			/>
			<KeyboardHelp open={keyboardHelpOpen} onClose={() => setKeyboardHelpOpen(false)} />
		</div>
	);
}
