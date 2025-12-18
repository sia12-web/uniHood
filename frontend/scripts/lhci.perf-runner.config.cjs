/**
 * Minimal Lighthouse CI config for the perf runner.
 *
 * Important: Do NOT set `staticDistDir` or `startServerCommand` here.
 * The perf runner expects the app to already be running (PERF_BASE_URL).
 */

module.exports = {
  ci: {
    collect: {
      // Intentionally empty: URLs + runs are passed via CLI flags.
      // Keep a default preset so results are stable if flags omit settings.
      settings: {
        preset: 'desktop',
      },
    },
    upload: {
      // Overridden by CLI flags in the perf runner.
      target: 'filesystem',
    },
  },
};
