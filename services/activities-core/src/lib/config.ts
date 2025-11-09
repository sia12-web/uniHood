export interface SpeedTypingConfig {
  rounds: number;
  timeLimitMs: number;
  textLen: {
    min: number;
    max: number;
  };
}

export function defaultSpeedTypingConfig(): SpeedTypingConfig {
  return {
    rounds: 3,
    timeLimitMs: 40_000,
    textLen: {
      min: 70,
      max: 120,
    },
  };
}
