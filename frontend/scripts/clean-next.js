const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const targets = [".next", ".turbo"];

for (const target of targets) {
  const full = path.join(root, target);
  try {
    fs.rmSync(full, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log(`[clean] removed ${target}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[clean] failed to remove ${target}:`, err instanceof Error ? err.message : err);
  }
}

