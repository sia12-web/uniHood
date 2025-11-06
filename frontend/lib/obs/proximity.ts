"use client";

const METRICS_PATH = "/api/ops/ui-metrics";

type ProximityUiEvent =
	| { event: "radius_change"; radius: number; live: boolean }
	| { event: "invite_send"; target: string; template?: string | null }
	| { event: "activity_launch"; kind: string; participants?: number | null }
	| { event: "mode_toggle"; mode: "live" | "passive" };

function sendBeacon(body: string): boolean {
	if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
		return false;
	}
	try {
		if (typeof Blob !== "undefined") {
			const blob = new Blob([body], { type: "application/json" });
			return navigator.sendBeacon(METRICS_PATH, blob);
		}
		return navigator.sendBeacon(METRICS_PATH, body);
	} catch {
		return false;
	}
}

export function emitProximityMetric(event: ProximityUiEvent): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		const body = JSON.stringify(event);
		if (!sendBeacon(body)) {
			void fetch(METRICS_PATH, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
				keepalive: true,
			});
		}
	} catch {
		// ignore telemetry failures
	}
}
