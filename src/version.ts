import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function readVersionFromPackageJson(metaUrl: string): string | null {
  const baseDir = dirname(fileURLToPath(metaUrl));
  const candidates = [resolve(baseDir, "../package.json"), resolve(baseDir, "../../package.json")];

  for (const path of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
      if (typeof pkg.version === "string" && /^\d+\.\d+\.\d+$/.test(pkg.version)) {
        return pkg.version;
      }
    } catch {
      // ignore and continue to the next candidate
    }
  }

  return null;
}

export const VEIL_VERSION = readVersionFromPackageJson(import.meta.url) ?? "0.0.0";
