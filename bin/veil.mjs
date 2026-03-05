#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "dist", "bin.js");

const run = spawnSync(process.execPath, [entry, ...args], {
  stdio: "inherit",
  env: process.env,
});

if (run.error) {
  process.stderr.write(`Failed to launch veil entrypoint: ${String(run.error.message ?? run.error)}\n`);
  process.exit(1);
}

process.exit(run.status ?? 1);
