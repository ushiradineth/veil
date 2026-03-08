#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "../dist/bin.js");
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
  process.stderr.write(`${String(result.error)}\n`);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
