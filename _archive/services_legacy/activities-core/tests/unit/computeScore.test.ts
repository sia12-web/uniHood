import { describe, expect, it } from "vitest";
import {
  KeystrokeSample,
  TypingMetricsV2,
  computeTypingMetricsV2,
  computeScoreV2Breakdown,
  ewma,
  damerauLevenshteinAccuracy,
} from "../../src/lib/metrics";

describe("ewma", () => {
  it("applies exponential smoothing", () => {
    const series = [10, 20, 30];
    const result = ewma(series, 0.4, 5);
    expect(result).toBeCloseTo(19.3, 1);
  });
});

describe("damerauLevenshteinAccuracy", () => {
  it("treats transpositions as single edits", () => {
    const accuracy = damerauLevenshteinAccuracy("form", "from");
    expect(accuracy).toBeGreaterThan(0.5);
    expect(accuracy).toBeLessThan(1);
  });
});

describe("computeTypingMetricsV2", () => {
  it("ignores late samples beyond the grace period", () => {
    const samples: KeystrokeSample[] = [
      { t: 0, len: 0 },
      { t: 20_000, len: 30 },
      { t: 80_500, len: 60, late: true },
    ];
    const metrics = computeTypingMetricsV2("a".repeat(60), "a".repeat(60), samples, 60_000, 60_000);
    expect(metrics.instantWpmSeries).toHaveLength(1);
    expect(metrics.instantWpmSeries[0]).toBeGreaterThan(0);
  });
});

describe("computeScoreV2Breakdown", () => {
  const baseMetrics: TypingMetricsV2 = {
    wpm: 50,
    accuracy: 0.95,
    completed: true,
    timeMs: 40_000,
    instantWpmSeries: [50, 55, 60],
    smoothedWpm: 55,
  };

  it("caps burst penalties at -15", () => {
    const incidents = ["improbable_burst", "improbable_burst", "improbable_burst", "improbable_burst"];
    const breakdown = computeScoreV2Breakdown(baseMetrics, incidents);
    expect(breakdown.penalty).toBeLessThanOrEqual(15);
  });

  it("applies paste penalty once", () => {
    const breakdown = computeScoreV2Breakdown(baseMetrics, ["paste", "paste"]);
    expect(breakdown.penalty).toBe(15);
  });

  it("never drops below zero", () => {
  const harshMetrics: TypingMetricsV2 = { ...baseMetrics, smoothedWpm: 5, accuracy: 0.4 };
    const breakdown = computeScoreV2Breakdown(harshMetrics, ["paste", "improbable_burst", "improbable_burst", "improbable_burst"]);
    expect(breakdown.total).toBeGreaterThanOrEqual(0);
  });
});
