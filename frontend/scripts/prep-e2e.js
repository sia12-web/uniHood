#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const targets = [
  path.join(__dirname, "..", "playwright-report"),
  path.join(__dirname, "..", "test-results"),
];

if (process.env.CLEAR_NEXT_BUILD === "1") {
  // When we truly need a clean slate, allow opting in to removing the build artifacts.
  targets.push(path.join(__dirname, "..", ".next"));
}

for (const target of targets) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (error) {
    console.warn(`prep-e2e: unable to remove ${target}:`, error);
  }
}
