"use client";

import { useState } from 'react';

import { ThresholdsEditor } from '@/components/mod/safety/thresholds-editor';
import { ThresholdsSimResult } from '@/components/mod/safety/thresholds-sim-result';
import { useSafetyThresholds } from '@/hooks/mod/safety/use-thresholds';
import { useThresholdsSimulate, type ThresholdSimulateResponse } from '@/hooks/mod/safety/use-thresholds-simulate';

export default function SafetyThresholdsPage() {
	const { data, isLoading, error, refetch } = useSafetyThresholds();
	const { simulate, apply } = useThresholdsSimulate();
	const [lastSim, setLastSim] = useState<ThresholdSimulateResponse | null>(null);
	const [applyError, setApplyError] = useState<string | null>(null);

	const profiles = data?.profiles ?? [];

	const handleApply = async (note: string) => {
		if (!lastSim) return;
		setApplyError(null);
		try {
			await apply.mutateAsync({ token: lastSim.token, note });
			setLastSim(null);
			refetch();
		} catch (mutationError) {
			setApplyError(mutationError instanceof Error ? mutationError.message : 'Unable to apply thresholds');
			throw mutationError;
		}
	};

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
				<div className="h-[320px] animate-pulse rounded-3xl bg-slate-100" />
			</div>
		);
	}

	if (error) {
		const message = error instanceof Error ? error.message : 'Unable to load thresholds';
		return <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>;
	}

	if (!profiles.length) {
		return <p className="text-sm text-slate-500">No threshold profiles configured.</p>;
	}

	return (
		<div className="space-y-6">
			<ThresholdsEditor
				profiles={profiles}
				onSimulate={simulate.mutateAsync}
				onSimulateComplete={setLastSim}
				simulatePending={simulate.isPending}
			/>
			{applyError && <p className="text-sm text-rose-600">{applyError}</p>}
			<ThresholdsSimResult result={lastSim} onApply={handleApply} applying={apply.isPending} />
		</div>
	);
}
