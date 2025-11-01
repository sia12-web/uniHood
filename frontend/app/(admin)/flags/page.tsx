"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import FlagEditor from "@/components/FlagEditor";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import {
	deleteFlag,
	evaluateFlag,
	fetchFlags,
	fetchOverrides,
	upsertFlag,
	upsertOverride,
	deleteOverride,
} from "@/lib/flags";
import type { FeatureFlagRow, FlagEvaluationResultRow, FlagOverrideRow } from "@/lib/types";

export default function AdminFlagsPage() {
	const adminId = getDemoUserId();
	const campusId = getDemoCampusId();
	const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [overrides, setOverrides] = useState<FlagOverrideRow[]>([]);
	const [evaluation, setEvaluation] = useState<FlagEvaluationResultRow | null>(null);
	const [evalUser, setEvalUser] = useState<string>(adminId);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [busy, setBusy] = useState<boolean>(false);

	const loadFlags = useCallback(async () => {
		setError(null);
		try {
			const items = await fetchFlags(adminId, campusId);
			setFlags(items);
			setSelectedKey((current) => current ?? items[0]?.key ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load flags");
		}
	}, [adminId, campusId]);

	useEffect(() => {
		void loadFlags();
	}, [loadFlags]);

	useEffect(() => {
		if (!selectedKey) {
			setOverrides([]);
			return;
		}
		(async () => {
			try {
				const all = await fetchOverrides(adminId, selectedKey);
				setOverrides(all);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load overrides");
			}
		})();
	}, [adminId, selectedKey]);

	const handleSaveFlag = async (payload: { key: string; kind: FeatureFlagRow["kind"]; description: string; payload: Record<string, unknown> }) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const updated = await upsertFlag(adminId, payload, campusId);
			setFlags((current) => {
				const exists = current.some((item) => item.key === updated.key);
				if (exists) {
					return current.map((item) => (item.key === updated.key ? updated : item));
				}
				return [...current, updated].sort((a, b) => a.key.localeCompare(b.key));
			});
			setSelectedKey(updated.key);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save flag");
		} finally {
			setBusy(false);
		}
	};

	const handleDeleteFlag = async (key: string) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			await deleteFlag(adminId, key, campusId);
			setFlags((current) => current.filter((flag) => flag.key !== key));
			setOverrides([]);
			if (selectedKey === key) {
				setSelectedKey(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete flag");
		} finally {
			setBusy(false);
		}
	};

	const handleEvaluate = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedKey) {
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const result = await evaluateFlag(selectedKey, { userId: evalUser || adminId, campusId });
			setEvaluation(result);
			setSuccess("Flag evaluated");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to evaluate flag");
		} finally {
			setBusy(false);
		}
	};

	const handleCreateOverride = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedKey) {
			return;
		}
		const formData = new FormData(event.currentTarget);
		const userId = String(formData.get("user_id") ?? "").trim() || undefined;
		const scopedCampus = String(formData.get("campus_id") ?? "").trim() || undefined;
		const valueRaw = String(formData.get("value") ?? "{}");
		let value: Record<string, unknown>;
		try {
			value = JSON.parse(valueRaw || "{}");
		} catch {
			setError("Override payload must be valid JSON");
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const override = await upsertOverride(adminId, { key: selectedKey, value, user_id: userId, campus_id: scopedCampus }, campusId);
			setOverrides((current) => {
				const filtered = current.filter(
					(item) => !(item.key === override.key && item.user_id === override.user_id && item.campus_id === override.campus_id),
				);
				return [override, ...filtered];
			});
			setSuccess("Override saved");
			event.currentTarget.reset();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save override");
		} finally {
			setBusy(false);
		}
	};

	const handleDeleteOverride = async (override: FlagOverrideRow) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			await deleteOverride(adminId, { key: override.key, user_id: override.user_id ?? undefined, campus_id: override.campus_id ?? undefined }, campusId);
			setOverrides((current) =>
				current.filter(
					(item) => !(item.key === override.key && item.user_id === override.user_id && item.campus_id === override.campus_id),
				),
			);
			setSuccess("Override removed");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove override");
		} finally {
			setBusy(false);
		}
	};

	const selectedFlag = useMemo(() => flags.find((flag) => flag.key === selectedKey) ?? null, [flags, selectedKey]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-slate-900">Feature flags</h1>
				<p className="text-sm text-slate-600">
					Manage rollout state, percentage experiments, and audience overrides for Divan features. Overrides are processed in
					order of specificity (user, campus, global).
				</p>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{success ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
			<FlagEditor flags={flags} onSave={handleSaveFlag} onDelete={handleDeleteFlag} busy={busy} selectedKey={selectedKey} onSelect={setSelectedKey} />
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<header className="mb-3 flex items-center justify-between">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Overrides</h2>
					{selectedFlag ? <span className="text-xs text-slate-500">{selectedFlag.key}</span> : null}
				</header>
				{!selectedFlag ? (
					<p className="text-sm text-slate-500">Select a flag to inspect overrides.</p>
				) : (
					<>
						<form onSubmit={handleCreateOverride} className="grid gap-3 sm:grid-cols-4">
							<label className="text-sm sm:col-span-1">
								<span className="text-slate-600">User ID</span>
								<input name="user_id" type="text" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="optional" />
							</label>
							<label className="text-sm sm:col-span-1">
								<span className="text-slate-600">Campus ID</span>
								<input name="campus_id" type="text" defaultValue={campusId} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="optional" />
							</label>
							<label className="text-sm sm:col-span-2">
								<span className="text-slate-600">Value JSON</span>
								<input name="value" type="text" defaultValue={"{\"enabled\":true}"} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono" />
							</label>
							<div className="sm:col-span-4">
								<button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
									{busy ? "Saving…" : "Upsert override"}
								</button>
							</div>
						</form>
						{overrides.length === 0 ? (
							<p className="mt-4 text-sm text-slate-500">No overrides configured for this flag.</p>
						) : (
							<ul className="mt-4 space-y-2">
								{overrides.map((override) => (
									<li key={`${override.key}:${override.user_id ?? override.campus_id ?? "global"}`} className="flex items-start justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
										<div className="space-y-1 text-xs text-slate-600">
											<p className="font-medium text-slate-700">
												{override.user_id ? `User ${override.user_id}` : override.campus_id ? `Campus ${override.campus_id}` : "Global"}
											</p>
											<pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-slate-500">{JSON.stringify(override.value)}</pre>
										</div>
										<button
											type="button"
											disabled={busy}
											onClick={() => void handleDeleteOverride(override)}
											className="rounded bg-rose-100 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-200 disabled:opacity-50"
										>
											Remove
										</button>
									</li>
								))}
							</ul>
						)}
					</>
				)}
			</section>
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Evaluate</h2>
				<form onSubmit={handleEvaluate} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
					<label className="text-sm">
						<span className="text-slate-600">User ID</span>
						<input
							type="text"
							value={evalUser}
							onChange={(event) => setEvalUser(event.target.value)}
							className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
						/>
					</label>
					<button type="submit" disabled={busy || !selectedKey} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
						{busy ? "Checking…" : "Evaluate flag"}
					</button>
				</form>
				{evaluation ? (
					<div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						<p className="font-medium">Enabled: {String(evaluation.enabled)}</p>
						{evaluation.variant ? <p>Variant: {evaluation.variant}</p> : null}
						{Object.keys(evaluation.meta ?? {}).length > 0 ? (
							<pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(evaluation.meta)}</pre>
						) : null}
					</div>
				) : (
					<p className="mt-3 text-sm text-slate-500">Evaluation results will appear here.</p>
				)}
			</section>
		</main>
	);
}
