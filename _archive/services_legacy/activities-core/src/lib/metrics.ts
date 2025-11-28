export interface TypingMetrics {
  wpm: number;
  accuracy: number;
  completed: boolean;
  timeMs: number;
}

export interface KeystrokeSample {
  t: number;
  len: number;
  isPaste?: boolean;
  late?: boolean;
}

export interface TypingMetricsV2 extends TypingMetrics {
  instantWpmSeries: number[];
  smoothedWpm: number;
}

const MAX_TIME_MS = 10 * 60 * 1000; // 10 minutes safeguard

export function clampTime(raw: number | undefined, fallback: number): number {
  const base = Number.isFinite(fallback) ? fallback : 60_000;
  if (!Number.isFinite(raw)) {
    return Math.min(Math.max(base, 1), MAX_TIME_MS);
  }
  const value = raw ?? base;
  return Math.min(Math.max(value, 1), MAX_TIME_MS);
}

export function computeWPM(typedText: string, timeMs: number): number {
  if (!Number.isFinite(timeMs) || timeMs <= 0) {
    return 0;
  }
  const minutes = timeMs / 60_000;
  if (minutes <= 0) {
    return 0;
  }
  const words = typedText.length / 5;
  return words / minutes;
}

export function levenshteinAccuracy(target: string, typed: string): number {
  if (target === typed) {
    return 1;
  }
  if (target.length === 0) {
    return typed.length === 0 ? 1 : 0;
  }

  const rows = target.length + 1;
  const cols = typed.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols));

  for (let i = 0; i < rows; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = target[i - 1] === typed[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = dp[rows - 1][cols - 1];
  const longest = Math.max(target.length, typed.length, 1);
  const accuracy = 1 - distance / longest;
  return Math.max(0, Math.min(1, accuracy));
}

export function damerauLevenshteinAccuracy(target: string, typed: string): number {
  if (target === typed) {
    return 1;
  }
  if (target.length === 0) {
    return typed.length === 0 ? 1 : 0;
  }

  const rows = target.length + 1;
  const cols = typed.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = target[i - 1] === typed[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );

      if (i > 1 && j > 1 && target[i - 1] === typed[j - 2] && target[i - 2] === typed[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }

  const distance = dp[rows - 1][cols - 1];
  const longest = Math.max(target.length, typed.length, 1);
  const accuracy = 1 - distance / longest;
  return Math.max(0, Math.min(1, accuracy));
}

export function ewma(series: number[], alpha: number, seed?: number): number {
  if (series.length === 0) {
    return seed ?? 0;
  }

  let value = seed ?? series[0];
  for (const point of series) {
    value = alpha * point + (1 - alpha) * value;
  }
  return value;
}

function instantWpm(from: KeystrokeSample, to: KeystrokeSample): number {
  const deltaLen = to.len - from.len;
  const deltaTime = to.t - from.t;
  if (deltaLen <= 0 || deltaTime <= 0) {
    return 0;
  }
  const words = deltaLen / 5;
  const minutes = deltaTime / 60_000;
  if (minutes <= 0) {
    return 0;
  }
  return words / minutes;
}

export function computeTypingMetrics(
  targetText: string,
  typedText: string,
  clientMs?: number,
  defaultTimeMs = 60_000,
): TypingMetrics {
  const timeMs = clampTime(clientMs, defaultTimeMs);
  const wpm = computeWPM(typedText, timeMs);
  const accuracy = levenshteinAccuracy(targetText, typedText);
  const completed = typedText.length >= targetText.length;
  return { wpm, accuracy, completed, timeMs };
}

export function computeTypingMetricsV2(
  targetText: string,
  typedText: string,
  samples: KeystrokeSample[],
  roundEndMs: number | undefined,
  defaultTimeMs = 60_000,
): TypingMetricsV2 {
  const sanitized = samples.filter((sample) => !sample.late);
  const baseTime = clampTime(sanitized.at(-1)?.t, defaultTimeMs);
  const totalTime = sanitized.length > 1 ? Math.max(1, sanitized.at(-1)!.t - sanitized[0].t) : baseTime;

  const series: number[] = [];
  for (let i = 1; i < sanitized.length; i += 1) {
    series.push(instantWpm(sanitized[i - 1], sanitized[i]));
  }

  const smoothedWpm = ewma(series, 0.4, series[0] ?? 0);
  const accuracy = damerauLevenshteinAccuracy(targetText, typedText);
  const completed = typedText.length >= targetText.length;

  const fallbackTime = roundEndMs ? roundEndMs : defaultTimeMs;
  const timeMs = sanitized.length > 1 ? totalTime : clampTime(undefined, fallbackTime);
  const wpm = computeWPM(typedText, timeMs);

  return {
    wpm,
    accuracy,
    completed,
    timeMs,
    instantWpmSeries: series,
    smoothedWpm,
  };
}

export function computeScore(metrics: TypingMetrics): number {
  const base = Math.round(5 * Math.sqrt(Math.max(0, metrics.wpm)) * metrics.accuracy);
  const bonus = metrics.completed ? 10 : 0;
  return Math.max(0, base + bonus);
}

function wpmScoreFactor(wpm: number): number {
  return 6 * Math.sqrt(Math.max(0, wpm));
}

export interface ScoreBreakdown {
  base: number;
  bonus: number;
  penalty: number;
  total: number;
}

export function computeScoreV2Breakdown(metrics: TypingMetricsV2, incidents: string[]): ScoreBreakdown {
  const base = Math.floor(wpmScoreFactor(metrics.smoothedWpm) * metrics.accuracy);
  const bonus = metrics.completed && metrics.accuracy >= 0.9 ? 10 : 0;

  let penalty = 0;
  if (incidents.includes("paste")) {
    penalty += 15;
  }
  const burstCount = incidents.filter((incident) => incident === "improbable_burst").length;
  penalty += Math.min(15, burstCount * 5);

  const total = Math.max(0, base + bonus - penalty);

  return { base, bonus, penalty, total };
}

export function computeScoreV2(metrics: TypingMetricsV2, incidents: string[]): number {
  return computeScoreV2Breakdown(metrics, incidents).total;
}
