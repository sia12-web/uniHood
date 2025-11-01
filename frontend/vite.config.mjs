import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Exclude Playwright E2E specs from Vitest's run (Playwright has its own runner)
    exclude: ["**/*.e2e.*"],
  },
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
});