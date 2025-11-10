export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "nudity",
  "self-harm",
  "misinfo",
  "illegal",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
