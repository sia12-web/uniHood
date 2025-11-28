export interface SpeedTypingConfig {
  rounds: number;
  timeLimitMs: number;
  textLen: {
    min: number;
    max: number;
  };
}

export function defaultSpeedTypingConfig(): SpeedTypingConfig {
  const roundsEnv = parseInt(process.env.SPEED_TYPING_ROUNDS ?? "", 10);
  const timeLimitEnv = parseInt(process.env.SPEED_TYPING_TIME_LIMIT_MS ?? "", 10);
  const minLenEnv = parseInt(process.env.SPEED_TYPING_TEXT_MIN ?? "", 10);
  const maxLenEnv = parseInt(process.env.SPEED_TYPING_TEXT_MAX ?? "", 10);

  const rounds = Number.isFinite(roundsEnv) && roundsEnv > 0 ? roundsEnv : 1;
  const timeLimitMs = Number.isFinite(timeLimitEnv) && timeLimitEnv >= 5_000 ? timeLimitEnv : 40_000;
  const minLen = Number.isFinite(minLenEnv) && minLenEnv >= 10 ? minLenEnv : 70;
  const maxLen = Number.isFinite(maxLenEnv) && maxLenEnv >= minLen ? maxLenEnv : 120;

  return {
    rounds,
    timeLimitMs,
    textLen: {
      min: minLen,
      max: maxLen,
    },
  };
}
