import { KeystrokeSample } from "./metrics";

export type IncidentType = "paste" | "improbable_burst" | "late_input";

export interface IncidentRecord {
  type: IncidentType;
  at: number;
  detail?: Record<string, unknown>;
}

export interface KeystrokeIncidentResult {
  samples: KeystrokeSample[];
  incidents: IncidentRecord[];
  newIncidents: IncidentRecord[];
}

const PASTE_LENGTH_THRESHOLD = 10;
const PASTE_TIME_WINDOW_MS = 50;
const BURST_WINDOW_MS = 1_000;
const BURST_DELTA_THRESHOLD = 40;
const LATE_THRESHOLD_MS = 200;
const SKEW_ALPHA = 0.4;
const SKEW_MAX = 600;

function cloneIncidents(incidents: IncidentRecord[]): IncidentRecord[] {
  return incidents.map((incident) => ({ ...incident, detail: incident.detail ? { ...incident.detail } : undefined }));
}

export function recordKeystrokeSample(
  existingSamples: KeystrokeSample[] | undefined,
  existingIncidents: IncidentRecord[] | undefined,
  sample: KeystrokeSample,
  roundEndMs: number | undefined,
): KeystrokeIncidentResult {
  const samples = existingSamples ? [...existingSamples] : [];
  const incidents = existingIncidents ? cloneIncidents(existingIncidents) : [];
  const newIncidents: IncidentRecord[] = [];

  if (roundEndMs !== undefined && sample.t > roundEndMs + LATE_THRESHOLD_MS) {
    sample.late = true;
    const incident: IncidentRecord = {
      type: "late_input",
      at: sample.t,
      detail: { roundEndMs },
    };
    incidents.push(incident);
    newIncidents.push(incident);
    samples.push(sample);
    return { samples, incidents, newIncidents };
  }

  const prev = samples.at(-1);
  samples.push(sample);

  if (sample.isPaste || (prev && sample.t - prev.t <= PASTE_TIME_WINDOW_MS && sample.len - prev.len >= PASTE_LENGTH_THRESHOLD)) {
    const alreadyFlagged = incidents.some((incident) => incident.type === "paste");
    if (!alreadyFlagged) {
      const incident: IncidentRecord = {
        type: "paste",
        at: sample.t,
        detail: {
          lenDelta: prev ? sample.len - prev.len : sample.len,
        },
      };
      incidents.push(incident);
      newIncidents.push(incident);
    }
  }

  if (samples.length >= 2) {
    const windowStart = sample.t - BURST_WINDOW_MS;
    let earliest = sample;
    for (let i = samples.length - 2; i >= 0; i -= 1) {
      const candidate = samples[i];
      if (candidate.t < windowStart) {
        break;
      }
      earliest = candidate;
    }
    const lenDelta = sample.len - earliest.len;
    if (lenDelta > BURST_DELTA_THRESHOLD) {
      const incident: IncidentRecord = {
        type: "improbable_burst",
        at: sample.t,
        detail: { lenDelta, windowMs: BURST_WINDOW_MS },
      };
      incidents.push(incident);
      newIncidents.push(incident);
    }
  }

  return { samples, incidents, newIncidents };
}

export function mergeIncidentTypes(incidents: IncidentRecord[]): IncidentType[] {
  return incidents.map((incident) => incident.type);
}

export function updateSkewEstimate(current: number | undefined, sample: number): number {
  const next = current === undefined ? sample : SKEW_ALPHA * sample + (1 - SKEW_ALPHA) * current;
  return Math.min(SKEW_MAX, Math.max(-SKEW_MAX, next));
}

export function normalizeClientTime(clientMs: number, skewEstimate: number | undefined): number {
  return clientMs + (skewEstimate ?? 0);
}

export function lateThresholdMs(): number {
  return LATE_THRESHOLD_MS;
}
