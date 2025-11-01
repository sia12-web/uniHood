#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const targets = [
  path.join(__dirname, "..", ".next"),
  path.join(__dirname, "..", "playwright-report"),
  path.join(__dirname, "..", "test-results"),
];

for (const target of targets) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (error) {
    console.warn(`prep-e2e: unable to remove ${target}:`, error);
  }
}
