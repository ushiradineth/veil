import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { McpUpdateStatus, SkillUpdateStatus, UpdateCheckResult } from "./types";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SemverParts = [major: number, minor: number, patch: number];

type NpmUpdateCacheEntry = {
  ts: number;
  value: McpUpdateStatus;
};

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DEFAULT_TIMEOUT_MS = 2000;
const UPDATE_CACHE_TTL_MS = 10 * 60 * 1000;

export const VEIL_PACKAGE_NAME = "@ushiradineth/veil";

let fetchImpl: FetchLike = (input, init) => fetch(input, init);
let skillVersionOverride: string | null | undefined;
const npmUpdateCache = new Map<string, NpmUpdateCacheEntry>();

function readVersionFromPackageJson(metaUrl: string): string | null {
  const baseDir = dirname(fileURLToPath(metaUrl));
  const candidates = [resolve(baseDir, "../package.json"), resolve(baseDir, "../../package.json")];

  for (const path of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
      if (typeof pkg.version === "string" && SEMVER_RE.test(pkg.version)) {
        return pkg.version;
      }
    } catch {
      // ignore and continue to the next candidate
    }
  }

  return null;
}

function parseSkillVersionFromFrontmatter(raw: string): string | null {
  const match = raw.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/m);
  if (!match) return null;
  const version = match[1] ?? "";
  return SEMVER_RE.test(version) ? version : null;
}

function readSkillVersion(metaUrl: string): string | null {
  const baseDir = dirname(fileURLToPath(metaUrl));
  const candidates = [
    resolve(baseDir, "../skills/SKILL.md"),
    resolve(baseDir, "../../skills/SKILL.md"),
  ];
  for (const path of candidates) {
    try {
      const content = readFileSync(path, "utf8");
      const version = parseSkillVersionFromFrontmatter(content);
      if (version) return version;
    } catch {
      // ignore and continue to next candidate
    }
  }
  return null;
}

function parseSemver(value: string): SemverParts | null {
  if (!SEMVER_RE.test(value)) return null;
  const [major, minor, patch] = value.split(".").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return [major, minor, patch];
}

export function compareSemver(left: string, right: string): -1 | 0 | 1 | null {
  const lhs = parseSemver(left);
  const rhs = parseSemver(right);
  if (!lhs || !rhs) return null;
  for (let i = 0; i < 3; i++) {
    if (lhs[i] > rhs[i]) return 1;
    if (lhs[i] < rhs[i]) return -1;
  }
  return 0;
}

function currentSkillVersion(): string | null {
  if (skillVersionOverride !== undefined) return skillVersionOverride;
  return VEIL_SKILL_VERSION;
}

async function fetchLatestPackageVersion(packageName: string, timeoutMs: number): Promise<string> {
  const timeout = Number.isFinite(timeoutMs) ? Math.max(250, timeoutMs) : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);
  try {
    const target = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
    const response = await fetchImpl(target, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`npm lookup failed with status ${String(response.status)}`);
    }
    const payload = (await response.json()) as { version?: unknown };
    const latest = typeof payload.version === "string" ? payload.version : null;
    if (!latest || !SEMVER_RE.test(latest)) {
      throw new Error("npm lookup returned invalid version");
    }
    return latest;
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(packageName: string, currentVersion: string): string {
  return `${packageName}\u0000${currentVersion}`;
}

function cachedMcpUpdateStatus(
  packageName: string,
  currentVersion: string,
): McpUpdateStatus | null {
  const key = cacheKey(packageName, currentVersion);
  const cached = npmUpdateCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > UPDATE_CACHE_TTL_MS) return null;
  return {
    ...cached.value,
    source: "cache",
  };
}

function cacheMcpUpdateStatus(
  packageName: string,
  currentVersion: string,
  status: McpUpdateStatus,
): void {
  const key = cacheKey(packageName, currentVersion);
  npmUpdateCache.set(key, { ts: Date.now(), value: status });
}

export async function getMcpUpdateStatus(
  options: {
    package_name?: string;
    current_version?: string;
    allow_network?: boolean;
    force_refresh?: boolean;
    timeout_ms?: number;
  } = {},
): Promise<McpUpdateStatus> {
  const packageName = options.package_name ?? VEIL_PACKAGE_NAME;
  const currentVersion = options.current_version ?? VEIL_VERSION;
  const allowNetwork = options.allow_network ?? true;
  const forceRefresh = options.force_refresh === true;
  const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  if (!forceRefresh) {
    const cached = cachedMcpUpdateStatus(packageName, currentVersion);
    if (cached) return cached;
  }

  if (!allowNetwork) {
    const checkedAt = new Date().toISOString();
    return {
      package_name: packageName,
      current: currentVersion,
      latest: null,
      outdated: null,
      source: "unavailable",
      checked_at: checkedAt,
      warning: "network-check-disabled",
    };
  }

  try {
    const latest = await fetchLatestPackageVersion(packageName, timeoutMs);
    const compare = compareSemver(currentVersion, latest);
    const checkedAt = new Date().toISOString();
    const status: McpUpdateStatus = {
      package_name: packageName,
      current: currentVersion,
      latest,
      outdated: compare === null ? null : compare < 0,
      source: "network",
      checked_at: checkedAt,
    };
    if (compare === null) {
      status.warning = "version-compare-failed";
    }
    cacheMcpUpdateStatus(packageName, currentVersion, status);
    return status;
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    const checkedAt = new Date().toISOString();
    return {
      package_name: packageName,
      current: currentVersion,
      latest: null,
      outdated: null,
      source: "unavailable",
      checked_at: checkedAt,
      warning,
    };
  }
}

export function evaluateSkillUpdate(reportedVersion?: string): SkillUpdateStatus {
  const expected = currentSkillVersion();
  const reported = reportedVersion?.trim() ? reportedVersion.trim() : null;

  if (!expected) {
    return {
      expected: null,
      reported,
      outdated: null,
      reason: "expected-version-missing",
    };
  }
  if (!reported) {
    return {
      expected,
      reported: null,
      outdated: null,
      reason: "reported-version-missing",
    };
  }
  const compare = compareSemver(reported, expected);
  if (compare === null) {
    return {
      expected,
      reported,
      outdated: null,
      reason: "invalid-version",
    };
  }
  return {
    expected,
    reported,
    outdated: compare < 0,
    reason: null,
  };
}

export async function buildUpdateCheck(
  options: {
    reported_skill_version?: string;
    allow_network?: boolean;
    force_refresh?: boolean;
    timeout_ms?: number;
  } = {},
): Promise<UpdateCheckResult> {
  const mcp = await getMcpUpdateStatus({
    allow_network: options.allow_network,
    force_refresh: options.force_refresh,
    timeout_ms: options.timeout_ms,
  });
  const skill = evaluateSkillUpdate(options.reported_skill_version);
  return { mcp, skill };
}

export const VEIL_VERSION = readVersionFromPackageJson(import.meta.url) ?? "0.0.0";
export const VEIL_SKILL_VERSION = readSkillVersion(import.meta.url);

export const __internalVersion = {
  compareSemver,
  parseSkillVersionFromFrontmatter,
  setFetchImplForTests(nextFetch?: FetchLike) {
    fetchImpl = nextFetch ?? ((input, init) => fetch(input, init));
  },
  setSkillVersionForTests(version?: string | null) {
    skillVersionOverride = version;
  },
  resetUpdateCache() {
    npmUpdateCache.clear();
  },
};
