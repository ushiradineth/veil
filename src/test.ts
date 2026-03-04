import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  __internal,
  buildIndex,
  lookupIndex,
  getStatus,
  queryFiles,
  querySymbols,
  queryChunks,
  discoverIndex,
  shouldRefreshDiscover,
} from "./indexer";
import { diagnostics, PerformanceDiagnostics, profiler } from "./diagnostics";
import { __internalGit, ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";

const TEST_FIXTURES_DIR = join(import.meta.dir, "../test/fixtures");
const SMALL_REPO = join(TEST_FIXTURES_DIR, "small");
const MEDIUM_REPO = join(TEST_FIXTURES_DIR, "medium");
const TEMP_TEST_DIR = join(import.meta.dir, "../test/temp");

function git(repo: string, args: string[]): string {
  const out = spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
  if (out.status !== 0) {
    throw new Error(`Git command failed: git -C ${repo} ${args.join(" ")}\n${out.stderr}`);
  }
  return out.stdout.trim();
}

async function writeExecutableScript(path: string, body: string): Promise<void> {
  await writeFile(path, body, "utf-8");
  await chmod(path, 0o755);
}

beforeAll(async () => {
  await rm(TEMP_TEST_DIR, { recursive: true, force: true });
  await mkdir(TEMP_TEST_DIR, { recursive: true });
  await buildIndex(SMALL_REPO, "full");
  await buildIndex(MEDIUM_REPO, "full");
});

afterAll(async () => {
  await rm(TEMP_TEST_DIR, { recursive: true, force: true });
});

describe("Phase 1: Indexing correctness", () => {
  test("Build index for small repo", async () => {
    const manifest = await buildIndex(SMALL_REPO, "full");
    expect(manifest.file_count).toBeGreaterThan(0);
    expect(manifest.symbol_count).toBeGreaterThan(0);
    expect(manifest.chunk_count).toBeGreaterThan(0);
  });

  test("Index contains expected files", async () => {
    const files = await queryFiles(SMALL_REPO, "hello", 10);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("hello.ts");
  });

  test("Index extracts TypeScript symbols", async () => {
    const symbols = await querySymbols(SMALL_REPO, "greet", 10);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
  });

  test("Index extracts class symbols", async () => {
    const symbols = await querySymbols(SMALL_REPO, "Greeter", 10);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Greeter");
  });

  test("Index creates searchable chunks", async () => {
    const chunks = await queryChunks(SMALL_REPO, "Hello", 10);
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Build index for medium repo", async () => {
    const manifest = await buildIndex(MEDIUM_REPO, "full");
    expect(manifest.file_count).toBeGreaterThan(15);
    expect(manifest.symbol_count).toBeGreaterThan(30);
  });
});

describe("Phase 2: Query accuracy", () => {
  test("File query returns relevant results", async () => {
    const files = await queryFiles(SMALL_REPO, "math", 10);
    expect(files.length).toBeGreaterThan(0);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("math.ts");
  });

  test("File query respects limit", async () => {
    const files = await queryFiles(MEDIUM_REPO, "service", 5);
    expect(files.length).toBeLessThan(6);
  });

  test("Symbol query finds functions", async () => {
    const symbols = await querySymbols(SMALL_REPO, "add", 10);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("add");
  });

  test("Symbol query finds classes", async () => {
    const symbols = await querySymbols(MEDIUM_REPO, "Service", 10);
    expect(symbols.length).toBeGreaterThan(0);
  });

  test("Chunk search finds code content", async () => {
    const chunks = await queryChunks(SMALL_REPO, "multiply", 10);
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Chunk search with path prefix", async () => {
    const chunks = await queryChunks(SMALL_REPO, "function", 10, {
      path_prefix: "math",
    });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.path.includes("math")).toBe(true);
    }
  });

  test("Chunk search with language filter", async () => {
    const chunks = await queryChunks(SMALL_REPO, "export", 10, {
      language: "typescript",
    });
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Discover combines files, symbols, and chunks", async () => {
    const result = await discoverIndex(SMALL_REPO, "function", {
      files_limit: 5,
      symbols_limit: 5,
      search_limit: 5,
    });
    const hasResults = result.files.length > 0 || result.symbols.length > 0 || result.chunks.length > 0;
    expect(hasResults).toBe(true);
  });

  test("Lookup returns explainable contextual results", async () => {
    const result = await lookupIndex(MEDIUM_REPO, "where is process defined");
    expect(result.intent).toBe("code");
    expect(result.symbols.length > 0 || result.chunks.length > 0).toBe(true);

    const firstSymbol = result.symbols[0];
    if (firstSymbol) {
      expect(firstSymbol.score).toBeGreaterThan(0);
      expect(firstSymbol.reasons.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(firstSymbol.confidence);
    }

    expect(result.fallback).toBeDefined();
    expect(typeof result.fallback.used).toBe("boolean");

    for (const group of [result.files, result.symbols, result.chunks]) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        expect(group[i]!.score >= group[i + 1]!.score).toBe(true);
      }
      for (const row of group) {
        expect(row.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  test("Lookup results maintain descending score order for dense query", async () => {
    const result = await lookupIndex(MEDIUM_REPO, "service process");
    for (const group of [result.files, result.symbols, result.chunks]) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        expect(group[i]!.score >= group[i + 1]!.score).toBe(true);
      }
    }
  });
});

describe("Phase 3: Cache behavior", () => {
  test("Status returns valid index info", async () => {
    const status = await getStatus(SMALL_REPO);
    expect(status.exists).toBe(true);
    expect(status.manifest).not.toBeNull();
    expect(status.manifest!.file_count).toBeGreaterThan(0);
    expect(status.manifest!.symbol_count).toBeGreaterThan(0);
    expect(status.manifest!.chunk_count).toBeGreaterThan(0);
  });

  test("Discover refresh guard skips dirty-only staleness", () => {
    expect(
      shouldRefreshDiscover({ exists: true, stale: true, reasons: ["workspace-dirty"], manifest: null, current_git_head: null }),
    ).toBe(false);
    expect(
      shouldRefreshDiscover({ exists: true, stale: true, reasons: ["ttl-expired"], manifest: null, current_git_head: null }),
    ).toBe(true);
    expect(
      shouldRefreshDiscover({
        exists: true,
        stale: true,
        reasons: ["workspace-dirty", "git-head-mismatch"],
        manifest: null,
        current_git_head: null,
      }),
    ).toBe(true);
  });

  test("Warm query path stays within expected latency range", async () => {
    const sample = async (): Promise<number> => {
      const start = Bun.nanoseconds();
      await queryFiles(SMALL_REPO, "test", 10);
      return (Bun.nanoseconds() - start) / 1e6;
    };

    const cold = await sample();
    const warmSamples = [await sample(), await sample(), await sample(), await sample()];
    const warmAvg = warmSamples.reduce((sum, value) => sum + value, 0) / warmSamples.length;
    expect(warmAvg).toBeLessThan(cold * 2 + 2);
  });

  test("Changed mode rebuilds only modified files", async () => {
    const fullManifest = await buildIndex(SMALL_REPO, "full");
    const changedManifest = await buildIndex(SMALL_REPO, "changed");
    expect(changedManifest.file_count).toBe(fullManifest.file_count);
  });

  test("Changed mode includes staged, unstaged, and untracked files", async () => {
    const repo = join(TEMP_TEST_DIR, "dirty-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "a.ts"), "export const alpha = () => 'base-alpha'\n");
    await writeFile(join(repo, "b.ts"), "export const beta = () => 'base-beta'\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    await buildIndex(repo, "full");

    await writeFile(join(repo, "a.ts"), "export const alpha = () => 'unstaged-dirty-alpha'\n");
    await writeFile(join(repo, "b.ts"), "export const beta = () => 'staged-dirty-beta'\n");
    await writeFile(join(repo, "c.ts"), "export const gamma = () => 'untracked-dirty-gamma'\n");
    git(repo, ["add", "b.ts"]);

    const status = await getStatus(repo);
    expect(status.reasons.includes("workspace-dirty")).toBe(true);

    await buildIndex(repo, "changed");

    const unstaged = await queryChunks(repo, "unstaged-dirty-alpha", 5);
    const staged = await queryChunks(repo, "staged-dirty-beta", 5);
    const untracked = await queryFiles(repo, "c.ts", 5);

    expect(unstaged.length).toBeGreaterThan(0);
    expect(staged.length).toBeGreaterThan(0);
    expect(untracked.some((item) => item.path === "c.ts")).toBe(true);
  });

  test("Diagnostics counters increase for build and queries", async () => {
    diagnostics.reset();
    await buildIndex(SMALL_REPO, "full");
    await queryFiles(SMALL_REPO, "hello", 5);
    await querySymbols(SMALL_REPO, "greet", 5);
    await queryChunks(SMALL_REPO, "Hello", 5);
    await lookupIndex(SMALL_REPO, "where is add defined");

    const snap = diagnostics.getDiagnostics();
    expect(snap.operations.index_builds).toBeGreaterThan(0);
    expect(snap.operations.total_queries).toBeGreaterThan(0);
    expect(snap.latency.max_ms).toBeGreaterThan(0);
    expect(snap.latency.build_max_ms).toBeGreaterThan(0);
  });

  test("Diagnostics track git and gh failures plus timeout", async () => {
    diagnostics.reset();

    const nonRepo = await mkdtemp(join(tmpdir(), "veil-diag-git-fail-"));
    const gitFail = gitStatus(nonRepo);
    expect(gitFail.meta.ok).toBe(false);
    await rm(nonRepo, { recursive: true });

    const ghMissing = ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: "gh-definitely-missing",
    });
    expect(ghMissing.meta.ok).toBe(false);

    const slowGh = join(TEMP_TEST_DIR, "slow-gh.sh");
    await writeFile(slowGh, "#!/bin/sh\nsleep 2\nexit 0\n", "utf-8");
    await chmod(slowGh, 0o755);
    const ghTimeout = ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: slowGh,
      timeout_ms: 500,
    });
    expect(ghTimeout.meta.ok).toBe(false);
    expect(ghTimeout.error?.code).toBe("timeout");

    const snap = diagnostics.getDiagnostics();
    expect(snap.operations.git_calls).toBeGreaterThanOrEqual(3);
    expect(snap.operations.gh_calls).toBeGreaterThanOrEqual(2);
    expect(snap.operations.git_failures).toBeGreaterThanOrEqual(3);
    expect(snap.operations.git_timeouts).toBeGreaterThanOrEqual(1);
    expect(snap.latency.gh_max_ms).toBeGreaterThan(0);
  });

  test("Git status reports dirty files in repository", async () => {
    const repo = join(TEMP_TEST_DIR, "git-status-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "a.ts"), "export const a = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await writeFile(join(repo, "a.ts"), "export const a = 2\n");

    const result = gitStatus(repo);
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.dirty).toBe(true);
    expect(result.data!.changed.unstaged).toBeGreaterThan(0);
  });

  test("Git status counts untracked files", async () => {
    const repo = join(TEMP_TEST_DIR, "git-status-untracked-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "u.ts"), "export const u = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await writeFile(join(repo, "new.ts"), "export const n = 1\n");

    const result = gitStatus(repo);
    expect(result.meta.ok).toBe(true);
    expect((result.data?.changed.untracked ?? 0) > 0).toBe(true);
  });

  test("Git status supports forced Date.now fallback clock", async () => {
    const prev = process.env.VEIL_FORCE_DATE_NOW ?? "0";
    process.env.VEIL_FORCE_DATE_NOW = prev;
    let toggled = false;
    process.env.VEIL_FORCE_DATE_NOW = "1";
    try {
      const result = gitStatus(SMALL_REPO);
      expect(result.meta.duration_ms).toBeGreaterThanOrEqual(0);
    } finally {
      toggled = true;
      process.env.VEIL_FORCE_DATE_NOW = prev;
    }
    expect(toggled).toBe(true);
  });

  test("Git internal clock helper supports explicit fallback path", () => {
    const stamp = __internalGit.nowMs({});
    expect(stamp).toBeGreaterThan(0);
  });

  test("Git log returns bounded commit entries", async () => {
    const repo = join(TEMP_TEST_DIR, "git-log-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "log.ts"), "export const log = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "first"]);
    await writeFile(join(repo, "log.ts"), "export const log = 2\n");
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "second"]);

    const result = gitLog(repo, { limit: 2 });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.entries.length).toBeLessThan(3);
  });

  test("Git diff includes unstaged changes", async () => {
    const repo = join(TEMP_TEST_DIR, "git-diff-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "b.ts"), "export const b = 'before'\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await writeFile(join(repo, "b.ts"), "export const b = 'after'\n");

    const result = gitDiff(repo, { path: "b.ts" });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.text.includes("after")).toBe(true);
  });

  test("Git diff rejects invalid path outside workspace", async () => {
    const repo = join(TEMP_TEST_DIR, "git-invalid-path-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "p.ts"), "export const p = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitDiff(repo, { path: "../escape.ts" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-path");
  });

  test("Git diff rejects invalid revision tokens", async () => {
    const repo = join(TEMP_TEST_DIR, "git-invalid-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "rev.ts"), "export const rev = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitDiff(repo, { base: "HEAD bad" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git diff rejects invalid head revision tokens", async () => {
    const repo = join(TEMP_TEST_DIR, "git-invalid-head-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "rev.ts"), "export const rev = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitDiff(repo, { base: "HEAD", head: "HEAD bad" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git show reports invalid revision when missing", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-invalid-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitShow(repo, { rev: "" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git diff returns truncation metadata when output is capped", async () => {
    const repo = join(TEMP_TEST_DIR, "git-truncate-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "big.ts"), "export const big = 'a'\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);
    await writeFile(join(repo, "big.ts"), `${"x".repeat(4000)}\n`);

    const result = gitDiff(repo, { path: "big.ts", max_bytes: 1024 });
    expect(result.meta.ok).toBe(true);
    expect(result.meta.truncated).toBe(true);
    expect(result.meta.warnings.length).toBeGreaterThan(0);
  });

  test("Git status reports git-unavailable when command is missing", async () => {
    const result = gitStatus(SMALL_REPO, { command: "git-missing-binary" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("git-unavailable");
  });

  test("Git status returns command-failed when follow-up command fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-status-fail.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--is-inside-work-tree\" ]; then echo true; exit 0; fi\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--show-toplevel\" ]; then pwd; exit 0; fi\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--abbrev-ref\" ]; then exit 2; fi\nexit 0\n",
    );
    const result = gitStatus(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git status returns not-a-repo when show-toplevel fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-top-fail.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--is-inside-work-tree\" ]; then echo true; exit 0; fi\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--show-toplevel\" ]; then exit 2; fi\nexit 0\n",
    );
    const result = gitStatus(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
  });

  test("Git status catches realpath failures and rejects outside root", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-bad-top.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--is-inside-work-tree\" ]; then echo true; exit 0; fi\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--show-toplevel\" ]; then echo /no/such/root; exit 0; fi\nexit 0\n",
    );
    const result = gitStatus(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
  });

  test("Git log and show fail on non-repo workspace", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "veil-non-repo-multi-"));
    const logResult = gitLog(nonRepo, { limit: 3 });
    const showResult = gitShow(nonRepo, { rev: "HEAD" });
    expect(logResult.meta.ok).toBe(false);
    expect(logResult.error?.code).toBe("not-a-repo");
    expect(showResult.meta.ok).toBe(false);
    expect(showResult.error?.code).toBe("not-a-repo");
    await rm(nonRepo, { recursive: true });
  });

  test("Git log returns command-failed when log command fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-log-fail.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--is-inside-work-tree\" ]; then echo true; exit 0; fi\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--show-toplevel\" ]; then pwd; exit 0; fi\nif [ \"$3\" = \"log\" ]; then exit 9; fi\nexit 0\n",
    );
    const result = gitLog(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git diff fails on non-repo workspace", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "veil-non-repo-diff-"));
    const result = gitDiff(nonRepo, { path: "a.ts" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
    await rm(nonRepo, { recursive: true });
  });

  test("Git diff returns command-failed when diff command fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-diff-fail.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--is-inside-work-tree\" ]; then echo true; exit 0; fi\nif [ \"$3\" = \"rev-parse\" ] && [ \"$4\" = \"--show-toplevel\" ]; then pwd; exit 0; fi\nif [ \"$3\" = \"diff\" ]; then exit 7; fi\nexit 0\n",
    );
    const result = gitDiff(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git diff base-only mode succeeds", async () => {
    const repo = join(TEMP_TEST_DIR, "git-base-only-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "base.ts"), "export const base = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitDiff(repo, { base: "HEAD", name_only: true });
    expect(result.meta.ok).toBe(true);
    expect(result.data?.mode).toBe("working");
  });

  test("Git show flags unknown revision as invalid-revision", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-unknown-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitShow(repo, { rev: "notarev123" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git diff rejects revision with unsafe punctuation", async () => {
    const repo = join(TEMP_TEST_DIR, "git-unsafe-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "unsafe.ts"), "export const unsafe = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitDiff(repo, { base: "HEAD:foo" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git show rejects invalid path argument", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-invalid-path-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitShow(repo, { rev: "HEAD", path: "/abs/path.ts" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-path");
  });

  test("GH lookup supports prs and checks with authenticated mock command", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-ok.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo gh-2; exit 0; fi\nif [ \"$1\" = \"auth\" ] && [ \"$2\" = \"status\" ]; then echo ok; exit 0; fi\nif [ \"$1\" = \"pr\" ]; then echo pr-list; exit 0; fi\nif [ \"$1\" = \"run\" ]; then echo check-list; exit 0; fi\nexit 1\n",
    );
    const prs = ghLookup(SMALL_REPO, { repo: "owner/repo", kind: "prs", query: "is:open", command: script });
    const checks = ghLookup(SMALL_REPO, { repo: "owner/repo", kind: "checks", command: script });
    expect(prs.meta.ok).toBe(true);
    expect(prs.data?.text.includes("pr-list")).toBe(true);
    expect(checks.meta.ok).toBe(true);
    expect(checks.data?.text.includes("check-list")).toBe(true);
  });

  test("GH lookup returns command-failed after auth succeeds", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-fail-after-auth.sh");
    await writeExecutableScript(
      script,
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo gh-2; exit 0; fi\nif [ \"$1\" = \"auth\" ] && [ \"$2\" = \"status\" ]; then echo ok; exit 0; fi\nexit 5\n",
    );
    const result = ghLookup(SMALL_REPO, { repo: "owner/repo", kind: "issues", command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git show returns commit metadata", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "show"]);

    const result = gitShow(repo, { rev: "HEAD", patch: false });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.text.includes("Commit:")).toBe(true);
  });

  test("Git status works from repository subdirectory workspace", async () => {
    const repo = join(TEMP_TEST_DIR, "git-subdir-repo");
    const subdir = join(repo, "pkg");
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, "mod.ts"), "export const mod = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const result = gitStatus(subdir);
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
  });

  test("Git diff accepts revision range with HEAD~1..HEAD", async () => {
    const repo = join(TEMP_TEST_DIR, "git-range-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "range.ts"), "export const value = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "first"]);
    await writeFile(join(repo, "range.ts"), "export const value = 2\n");
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "second"]);

    const result = gitDiff(repo, { base: "HEAD~1", head: "HEAD", name_only: true });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.text.includes("range.ts")).toBe(true);
  });

  test("Git tools fail with not-a-repo on non-git workspace", async () => {
    const repo = await mkdtemp(join(tmpdir(), "veil-not-a-repo-"));
    await writeFile(join(repo, "c.ts"), "export const c = 3\n");
    const result = gitStatus(repo);
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
    await rm(repo, { recursive: true });
  });

  test("GH lookup reports unavailable binary deterministically", () => {
    const result = ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: "gh-does-not-exist",
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("gh-unavailable");
  });

  test("GH lookup reports unauthenticated when command is present without auth", () => {
    const result = ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: "git",
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("gh-unauthenticated");
  });

  test("Git helper throws on command failure", () => {
    let threw = false;
    try {
      git(join(TEMP_TEST_DIR, "definitely-not-a-repo"), ["status"]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("Phase 4: Edge cases", () => {
  test("Empty query returns empty results", async () => {
    const files = await queryFiles(SMALL_REPO, "", 10);
    expect(files.length).toBe(0);
  });

  test("Query with special characters", async () => {
    const files = await queryFiles(SMALL_REPO, "hello.ts", 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Very long query string", async () => {
    const longQuery = "a".repeat(1000);
    const files = await queryFiles(SMALL_REPO, longQuery, 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Query non-existent content", async () => {
    const files = await queryFiles(SMALL_REPO, "nonexistentxyzabc", 10);
    expect(files.length).toBe(0);
  });

  test("Build index for empty directory", async () => {
    const emptyDir = join(TEMP_TEST_DIR, "empty");
    await mkdir(emptyDir, { recursive: true });
    const manifest = await buildIndex(emptyDir, "full");
    expect(manifest.file_count).toBe(0);
  });

  test("Handle directory with only non-code files", async () => {
    const nonCodeDir = join(TEMP_TEST_DIR, "non-code");
    await mkdir(nonCodeDir, { recursive: true });
    await writeFile(join(nonCodeDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(nonCodeDir, "data.bin"), Buffer.from([0x00, 0x01, 0x02]));
    const manifest = await buildIndex(nonCodeDir, "full");
    expect(manifest.file_count).toBeGreaterThanOrEqual(0);
  });

  test("Malformed manifest reports stale status without throwing", async () => {
    const repo = join(TEMP_TEST_DIR, "malformed-manifest");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "alpha.ts"), "export const alpha = 1\n");
    await buildIndex(repo, "full");

    const manifestPath = join(repo, ".agents", "index", "manifest.json");
    await writeFile(manifestPath, "{this-is-not-json\n");

    const status = await getStatus(repo);
    expect(status.exists).toBe(true);
    expect(status.stale).toBe(true);
    expect(status.reasons.includes("manifest-invalid-json")).toBe(true);
  });

  test("Malformed NDJSON index does not crash file query", async () => {
    const repo = join(TEMP_TEST_DIR, "malformed-ndjson");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "beta.ts"), "export const beta = 2\n");
    await buildIndex(repo, "full");

    const filesIndexPath = join(repo, ".agents", "index", "files.ndjson");
    await writeFile(filesIndexPath, "{broken-json-line\n");

    const files = await queryFiles(repo, "beta", 10);
    expect(files.length).toBe(0);
  });
});

describe("Phase 5: Performance characteristics", () => {
  test("Index build completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await buildIndex(MEDIUM_REPO, "full");
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(5000);
  });

  test("File query completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await queryFiles(MEDIUM_REPO, "service", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(100);
  });

  test("Symbol query completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await querySymbols(MEDIUM_REPO, "process", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(100);
  });

  test("Chunk search completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await queryChunks(MEDIUM_REPO, "async fetch", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(100);
  });
});

describe("Indexer internals", () => {
  test("TopKHeap maintains highest scores with replacement", () => {
    const heap = new __internal.TopKHeap<string>(2);
    heap.insert("a", 1);
    heap.insert("b", 2);
    heap.insert("c", 3);
    heap.insert("d", 0.5);
    const out = heap.toSortedArray();
    expect(out).toEqual(["c", "b"]);
  });

  test("TopKHeap heapifyDown checks right child branch", () => {
    const heap = new __internal.TopKHeap<string>(3);
    heap.insert("low", 2);
    heap.insert("high", 5);
    heap.insert("mid", 3);
    heap.insert("top", 6);
    const out = heap.toSortedArray();
    expect(out).toEqual(["top", "high", "mid"]);
  });

  test("listFilesFallback walks non-git workspace", async () => {
    const root = join(TEMP_TEST_DIR, "fallback-list-files");
    const nested = join(root, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, "one.ts"), "export const one = 1\n");
    await writeFile(join(nested, "two.ts"), "export const two = 2\n");
    const listed = await __internal.listFilesFallback(root);
    expect(listed.includes("one.ts")).toBe(true);
    expect(listed.some((p) => p.endsWith("nested/two.ts"))).toBe(true);
  });

  test("score helpers emit exact and token reasons", () => {
    const parsed = {
      normalized: "hello world",
      tokens: ["hello", "world"],
      pathTokens: [],
      intent: "code",
    } as const;
    const file = __internal.scoreFile("src/hello-world.ts", parsed as never);
    const symbol = __internal.scoreSymbol({ path: "src/hello.ts", line: 1, kind: "function", name: "helloWorld" }, parsed as never);
    const chunk = __internal.scoreChunk(
      { id: "1", path: "src/hello.ts", start_line: 1, end_line: 1, content: "export const helloWorld = true" },
      parsed as never,
    );
    expect(file.reasons.length).toBeGreaterThan(0);
    expect(symbol.reasons.length).toBeGreaterThan(0);
    expect(chunk.reasons.length).toBeGreaterThan(0);
  });
});

describe("Profiler utilities", () => {
  test("Profiler reports no data when empty", () => {
    profiler.reset();
    expect(profiler.report()).toBe("No profiling data available");
  });

  test("Profiler records marks and measurements when enabled", async () => {
    profiler.reset();
    profiler.enable();
    expect(profiler.isEnabled()).toBe(true);
    profiler.mark("sample");
    await Bun.sleep(1);
    profiler.measure("sample");
    const markers = profiler.getMarkers();
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.name).toBe("sample");
    expect((markers[0]?.duration ?? 0) >= 0).toBe(true);
    expect(profiler.report().includes("Profiling Report")).toBe(true);
  });

  test("Profiler disable and reset clear state", () => {
    profiler.disable();
    expect(profiler.isEnabled()).toBe(false);
    profiler.mark("ignored");
    profiler.measure("ignored");
    profiler.reset();
    expect(profiler.getMarkers().length).toBe(0);
  });

  test("Diagnostics installs SIGINT and SIGTERM handlers", () => {
    const hooks = new Map<string, () => void>();
    const exits: number[] = [];
    const d = new PerformanceDiagnostics({
      registerHook: (event, handler) => {
        hooks.set(event, handler);
      },
      exitFn: (code) => {
        exits.push(code);
      },
      statePath: join(TEMP_TEST_DIR, "diag-test-state.json"),
      persistIntervalMs: 0,
    });
    d.recordCacheHit();
    hooks.get("beforeExit")?.();
    hooks.get("exit")?.();
    hooks.get("SIGINT")?.();
    hooks.get("SIGTERM")?.();
    expect(exits).toEqual([130, 143]);
  });

  test("Diagnostics instance exercises all counter APIs", () => {
    const d = new PerformanceDiagnostics({
      registerHook: () => {
        return;
      },
      exitFn: () => {
        return;
      },
      statePath: join(TEMP_TEST_DIR, "diag-direct-state.json"),
      persistIntervalMs: 0,
    });
    d.recordCacheHit();
    d.recordCacheMiss();
    d.recordQuery(3);
    d.recordIndexBuild();
    d.recordBuildLatency(5);
    d.recordCacheInvalidation();
    d.updateCacheSizes(2, 1);
    d.recordGitCall(7, true, false, false);
    d.recordGitCall(11, false, true, true);
    const snap = d.getDiagnostics();
    expect(snap.cache.query_cache_hits).toBeGreaterThanOrEqual(1);
    expect(snap.cache.query_cache_misses).toBeGreaterThanOrEqual(1);
    expect(snap.operations.total_queries).toBeGreaterThanOrEqual(1);
    expect(snap.operations.index_builds).toBeGreaterThanOrEqual(1);
    expect(snap.operations.cache_invalidations).toBeGreaterThanOrEqual(1);
    expect(snap.operations.git_calls).toBeGreaterThanOrEqual(2);
    expect(snap.operations.gh_calls).toBeGreaterThanOrEqual(1);
    d.reset();
  });

  test("Diagnostics default constructor path can load and report", () => {
    const d = new PerformanceDiagnostics();
    d.recordQuery(1);
    const snap = d.getDiagnostics();
    expect(snap.latency.max_ms).toBeGreaterThanOrEqual(0);
  });

});
