'use client';

const METRICS_PATH = '/api/ops/ui-metrics';

export type SafetyUiMetricEvent =
	| { event: 'quarantine_reveal' }
	| { event: 'quarantine_decision'; verdict: 'clean' | 'tombstone' | 'blocked' }
	| { event: 'thresholds_simulate' }
	| { event: 'hash_import'; count: number }
	| { event: 'url_query' }
	| { event: 'rep_restriction_created'; mode: string; scope: string }
	| { event: 'rep_restriction_revoked'; restrictionId?: string }
	| { event: 'rep_adjust_score'; delta: number }
	| { event: 'linkage_open'; userId: string }
	| { event: 'appeal_resolve'; status: 'accepted' | 'rejected'; caseId: string }
	| { event: 'ui_tools_catalog_create_total' }
	| { event: 'ui_tools_macro_simulate_total'; macro: string; sample_size: number | null }
	| { event: 'ui_tools_macro_execute_total'; macro: string; targets: number | null }
	| { event: 'ui_tools_unshadow_execute_total' }
	| { event: 'ui_tools_revert_execute_total'; actions: readonly string[] }
	| { event: 'ui_tools_bundle_import_total'; mode: 'dry_run' | 'execute' }
	| { event: 'ui_triage_action_total'; action: string }
	| { event: 'ui_triage_keyboard_used_total'; key: string }
	| { event: 'ui_triage_claim_total' }
	| { event: 'ui_triage_conflict_total'; reason?: string }
	| { event: 'ui_triage_queue_load_total'; queue: string; items: number };

function sendWithBeacon(body: string): boolean {
	if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
		return false;
	}
	try {
		if (typeof Blob !== 'undefined') {
			const blob = new Blob([body], { type: 'application/json' });
			return navigator.sendBeacon(METRICS_PATH, blob);
		}
		return navigator.sendBeacon(METRICS_PATH, body);
	} catch {
		return false;
	}
}

export function emitSafetyMetric(event: SafetyUiMetricEvent): void {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		const body = JSON.stringify(event);
		if (!sendWithBeacon(body)) {
			void fetch(METRICS_PATH, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				keepalive: true,
			});
		}
	} catch {
		// ignore best-effort telemetry failures
	}
}
