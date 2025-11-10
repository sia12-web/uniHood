export const FLAGS = {
  MOD_UI: "ui.moderation.enabled",
  SAFETY_UI: "ui.safety.enabled",
  MEDIA_V2: "ui.media.v2.enabled",
  UX_METRICS: "ui.metrics.ux.enabled",
  BLUR_SENSITIVE: "ui.blur.sensitive.enabled",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
