import { defineConfig } from "@playwright/test";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const USE_BUILD = process.env.PLAYWRIGHT_USE_BUILD === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: USE_BUILD ? "npm run start" : "npm run dev",
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NODE_OPTIONS: "",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_COMMUNITIES_STUB: "1",
      PLAYWRIGHT_BASE_URL: `http://localhost:${PORT}`,
    },
  },
});
