"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { MacroPlanResponse, MacroSimulateRequest, MacroExecuteRequest } from "@/hooks/mod/tools/use-macro";
import type { SelectorBuilderValue } from "@/components/mod/tools/selector-builder";
import { SelectorBuilder } from "@/components/mod/tools/selector-builder";
import { parseJsonWithMeta, buildJsonErrorMessage } from "@/lib/json-schema-helpers";

export type MacroFormProps = {
	simulatePending: boolean;
	executePending: boolean;
	onSimulate(request: MacroSimulateRequest): Promise<void>;
	onExecute(request: MacroExecuteRequest): Promise<void>;
	plan: MacroPlanResponse | null;
	lastRequest: MacroSimulateRequest | null;
	canExecute: boolean;
	expiresInMs: number | null;
};

const EMPTY_SELECTOR: SelectorBuilderValue = { kind: "cases", ids: [] };

export function MacroForm({ simulatePending, executePending, onSimulate, onExecute, plan, lastRequest, canExecute, expiresInMs }: MacroFormProps) {
	const [macroKey, setMacroKey] = useState("safety.shadow_cleanup@1");
	const [selector, setSelector] = useState<SelectorBuilderValue>(EMPTY_SELECTOR);
	const [sampleSize, setSampleSize] = useState<string>("10");
	const [reason, setReason] = useState<string>("");
	const [variablesJson, setVariablesJson] = useState<string>("{}");
	const [error, setError] = useState<string | null>(null);
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [confirmInput, setConfirmInput] = useState("");

	const variablesParse = useMemo(() => parseJsonWithMeta<Record<string, unknown>>(variablesJson || "{}"), [variablesJson]);

	const currentRequest = useMemo(() => {
		if (!macroKey.trim()) {
			return null;
		}
		if (selector.kind === "cases" && selector.ids.length === 0) {
			return null;
		}
		if (selector.kind === "subjects" && selector.ids.length === 0) {
			return null;
		}
		if (!variablesParse.ok) {
			return null;
		}
		const sample = sampleSize.trim() ? Number(sampleSize) : undefined;
		if (sampleSize.trim() && (!Number.isFinite(sample) || Number(sample) <= 0)) {
			return null;
		}
		const base: MacroSimulateRequest = {
			macro: macroKey.trim(),
			selector,
			variables: variablesParse.ok ? variablesParse.value : undefined,
			sample_size: sample,
			reason_note: reason.trim() || undefined,
		};
		return base;
	}, [macroKey, selector, variablesParse, sampleSize, reason]);

	const requestMatchesPlan = useMemo(() => {
		if (!currentRequest || !lastRequest) return false;
		return JSON.stringify(currentRequest) === JSON.stringify(lastRequest);
	}, [currentRequest, lastRequest]);

	async function handleSimulate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setConfirmVisible(false);
		setConfirmInput("");
		if (!currentRequest) {
			if (!macroKey.trim()) {
				setError("Macro key is required");
			} else if (!variablesParse.ok) {
				setError(buildJsonErrorMessage(variablesParse));
			} else {
				setError("Selector requires at least one ID or query filters");
			}
			return;
		}
		await onSimulate(currentRequest);
	}

	async function handleExecute() {
		setError(null);
		if (!lastRequest || !plan) {
			setError("Simulate the macro before executing");
			return;
		}
		if (!canExecute) {
			setError("Simulation expired. Run simulate again.");
			return;
		}
		if (!requestMatchesPlan) {
			setError("Form changed since last simulation. Re-run simulate to refresh plan.");
			return;
		}
		if (!confirmVisible) {
			setConfirmVisible(true);
			return;
		}
		if (confirmInput.trim().toUpperCase() !== "RUN") {
			setError("Type RUN to confirm execution");
			return;
		}
		const payload: MacroExecuteRequest = {
			...lastRequest,
			plan_id: plan.plan_id,
		};
		await onExecute(payload);
		setConfirmVisible(false);
		setConfirmInput("");
	}

	return (
		<form onSubmit={handleSimulate} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Macro runner</h2>
				<p className="text-sm text-slate-600">Simulate plans before running. Executions require confirmation and create a job record.</p>
			</header>

			<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
				<span>Macro key@version</span>
				<input
					type="text"
					value={macroKey}
					onChange={(event) => setMacroKey(event.target.value)}
					className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
					placeholder="content.macro_cleanup@2025-10-01"
				/>
			</label>

			<SelectorBuilder value={selector} onChange={setSelector} />

			<div className="grid gap-4 md:grid-cols-3">
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Sample size (optional)</span>
					<input
						type="number"
						min={1}
						value={sampleSize}
						onChange={(event) => setSampleSize(event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
					/>
				</label>
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
					<span>Audit note (optional)</span>
					<input
						type="text"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="Reason for executing this macro"
					/>
				</label>
			</div>

			<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
				<span>Variables JSON (optional)</span>
				<textarea
					value={variablesJson}
					onChange={(event) => setVariablesJson(event.target.value)}
					className="h-32 w-full rounded-xl border border-slate-200 bg-slate-900/5 px-3 py-2 font-mono text-sm text-slate-800"
					spellCheck={false}
				/>
				{!variablesParse.ok ? (
					<p className="text-xs text-rose-600">{buildJsonErrorMessage(variablesParse)}</p>
				) : (
					<p className="text-xs text-slate-500">Pass macro variables; leave empty when not needed.</p>
				)}
			</label>

			{error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
			{plan && canExecute ? (
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status" aria-live="polite">
					Plan ready. Execute within {Math.max(0, Math.round((expiresInMs ?? 0) / 1000))} seconds or re-run simulate.
				</div>
			) : null}
			{plan && !canExecute ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Simulation expired. Re-run simulate to refresh token.</div>
			) : null}

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="submit"
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
					disabled={simulatePending}
				>
					{simulatePending ? "Simulating…" : "Simulate"}
				</button>
				<button
					type="button"
					onClick={handleExecute}
					className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:text-rose-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
					disabled={executePending || !plan}
				>
					{executePending ? "Executing…" : "Execute"}
				</button>
			</div>

			{confirmVisible ? (
				<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
					<p className="text-sm font-semibold text-rose-700">Type RUN to confirm execution.</p>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<label htmlFor="macro-run-confirm" className="sr-only">
							Type RUN to confirm execution
						</label>
						<input
							id="macro-run-confirm"
							type="text"
							value={confirmInput}
							onChange={(event) => setConfirmInput(event.target.value)}
							className="w-40 rounded-lg border border-rose-200 px-3 py-2 text-sm"
						/>
						<button
							type="button"
							onClick={handleExecute}
							className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
						>
							Confirm run
						</button>
						<button type="button" onClick={() => { setConfirmVisible(false); setConfirmInput(""); }} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300">
							Cancel
						</button>
					</div>
				</div>
			) : null}
		</form>
	);
}
