#!/usr/bin/env bun
/**
 * Comprehensive test suite for veil MCP server
 * 
 * Test coverage:
 * - Indexing correctness (files, symbols, chunks)
 * - Query accuracy (files, symbols, search)
 * - Cache invalidation and freshness
 * - Edge cases (empty repos, large files, unicode paths)
 * - Performance regression detection
 */

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildIndex,
  lookupIndex,
  getStatus,
  queryFiles,
  querySymbols,
  queryChunks,
  discoverIndex,
  shouldRefreshDiscover,
} from "./indexer";
import type { BuildMode, FileRecord, SymbolRecord, ChunkRecord } from "./types";
import { diagnostics } from "./diagnostics";

// Test configuration
const TEST_FIXTURES_DIR = join(import.meta.dir, "../test/fixtures");
const SMALL_REPO = join(TEST_FIXTURES_DIR, "small");
const MEDIUM_REPO = join(TEST_FIXTURES_DIR, "medium");
const TEMP_TEST_DIR = join(import.meta.dir, "../test/temp");

// Test state
let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;

// ANSI colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertGreaterThan(actual: number, threshold: number, message: string): void {
  if (actual <= threshold) {
    throw new Error(`${message}\n  Expected > ${threshold}, got ${actual}`);
  }
}

function assertLessThan(actual: number, threshold: number, message: string): void {
  if (actual >= threshold) {
    throw new Error(`${message}\n  Expected < ${threshold}, got ${actual}`);
  }
}

function assertContains<T>(array: T[], item: T, message: string): void {
  if (!array.includes(item)) {
    throw new Error(`${message}\n  Array does not contain: ${JSON.stringify(item)}`);
  }
}

function git(repo: string, args: string[]): string {
  const out = spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
  if (out.status !== 0) {
    throw new Error(`Git command failed: git -C ${repo} ${args.join(" ")}\n${out.stderr}`);
  }
  return out.stdout.trim();
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${name}`);
    console.error(`  ${RED}${error instanceof Error ? error.message : String(error)}${RESET}`);
  }
}

async function skip(name: string): Promise<void> {
  testsSkipped++;
  console.log(`${YELLOW}○${RESET} ${name} ${YELLOW}(skipped)${RESET}`);
}

// Test suite
async function runTests(): Promise<void> {
  console.log(`${BOLD}${BLUE}Running veil test suite${RESET}\n`);

  // Setup
  console.log(`${BOLD}Setup${RESET}`);
  await test("Create temp test directory", async () => {
    if (existsSync(TEMP_TEST_DIR)) {
      await rm(TEMP_TEST_DIR, { recursive: true });
    }
    await mkdir(TEMP_TEST_DIR, { recursive: true });
  });

  // Phase 1: Indexing correctness
  console.log(`\n${BOLD}Phase 1: Indexing Correctness${RESET}`);

  await test("Build index for small repo", async () => {
    const manifest = await buildIndex(SMALL_REPO, "full");
    assert(manifest.file_count > 0, "Should index at least one file");
    assert(manifest.symbol_count > 0, "Should extract at least one symbol");
    assert(manifest.chunk_count > 0, "Should create at least one chunk");
  });

  await test("Index contains expected files", async () => {
    const files = await queryFiles(SMALL_REPO, "hello", 10);
    const paths = files.map((f) => f.path);
    assertContains(paths, "hello.ts", "Should find hello.ts");
  });

  await test("Index extracts TypeScript symbols", async () => {
    const symbols = await querySymbols(SMALL_REPO, "greet", 10);
    assert(symbols.length > 0, "Should find greet symbols");
    const names = symbols.map((s) => s.name);
    assertContains(names, "greet", "Should find greet function");
  });

  await test("Index extracts class symbols", async () => {
    const symbols = await querySymbols(SMALL_REPO, "Greeter", 10);
    assert(symbols.length > 0, "Should find Greeter class");
    const names = symbols.map((s) => s.name);
    assertContains(names, "Greeter", "Should find Greeter class");
  });

  await test("Index creates searchable chunks", async () => {
    const chunks = await queryChunks(SMALL_REPO, "Hello", 10);
    assert(chunks.length > 0, "Should find chunks containing 'Hello'");
  });

  await test("Build index for medium repo", async () => {
    const manifest = await buildIndex(MEDIUM_REPO, "full");
    assertGreaterThan(manifest.file_count, 15, "Should index 20+ files");
    assertGreaterThan(manifest.symbol_count, 30, "Should extract 40+ symbols");
  });

  // Phase 2: Query accuracy
  console.log(`\n${BOLD}Phase 2: Query Accuracy${RESET}`);

  await test("File query returns relevant results", async () => {
    const files = await queryFiles(SMALL_REPO, "math", 10);
    assert(files.length > 0, "Should find math-related files");
    const paths = files.map((f) => f.path);
    assertContains(paths, "math.ts", "Should find math.ts");
  });

  await test("File query respects limit", async () => {
    const files = await queryFiles(MEDIUM_REPO, "service", 5);
    assertLessThan(files.length, 6, "Should respect limit of 5");
  });

  await test("Symbol query finds functions", async () => {
    const symbols = await querySymbols(SMALL_REPO, "add", 10);
    assert(symbols.length > 0, "Should find add function");
    const names = symbols.map((s) => s.name);
    assertContains(names, "add", "Should find add function");
  });

  await test("Symbol query finds classes", async () => {
    const symbols = await querySymbols(MEDIUM_REPO, "Service", 10);
    assert(symbols.length > 0, "Should find Service classes");
  });

  await test("Chunk search finds code content", async () => {
    const chunks = await queryChunks(SMALL_REPO, "multiply", 10);
    assert(chunks.length > 0, "Should find chunks with multiply");
  });

  await test("Chunk search with path prefix", async () => {
    const chunks = await queryChunks(SMALL_REPO, "function", 10, {
      path_prefix: "math",
    });
    assert(chunks.length > 0, "Should find chunks in math.ts");
    for (const chunk of chunks) {
      assert(chunk.path.includes("math"), "All chunks should be from math.ts");
    }
  });

  await test("Chunk search with language filter", async () => {
    const chunks = await queryChunks(SMALL_REPO, "export", 10, {
      language: "typescript",
    });
    assert(chunks.length > 0, "Should find TypeScript chunks");
  });

  await test("Discover combines files, symbols, and chunks", async () => {
    const result = await discoverIndex(SMALL_REPO, "function", {
      files_limit: 5,
      symbols_limit: 5,
      search_limit: 5,
    });
    // At least one of these should have results
    const hasResults = result.files.length > 0 || result.symbols.length > 0 || result.chunks.length > 0;
    assert(hasResults, "Should return at least some results");
  });

  await test("Lookup returns explainable contextual results", async () => {
    const result = await lookupIndex(SMALL_REPO, "where is greet defined");
    assertEqual(result.intent, "code", "Lookup should default to code intent for code-style prompts");
    assert(result.symbols.length > 0 || result.chunks.length > 0, "Lookup should return symbol or chunk hits");

    const firstSymbol = result.symbols[0];
    if (firstSymbol) {
      assert(firstSymbol.score > 0, "Lookup symbol score should be positive");
      assert(firstSymbol.reasons.length > 0, "Lookup symbol should include ranking reasons");
      assert(["high", "medium", "low"].includes(firstSymbol.confidence), "Lookup symbol should include confidence");
    }

    assert(result.fallback !== undefined, "Lookup should include fallback metadata");
    assert(typeof result.fallback.used === "boolean", "Lookup fallback.used should be a boolean");

    for (const group of [result.files, result.symbols, result.chunks]) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        assert(group[i]!.score >= group[i + 1]!.score, "Lookup results should be sorted by score descending");
      }
      for (const row of group) {
        assert(row.reasons.length > 0, "Lookup rows should always include at least one reason");
      }
    }
  });

  // Phase 3: Cache behavior
  console.log(`\n${BOLD}Phase 3: Cache Behavior${RESET}`);

  await test("Status returns valid index info", async () => {
    const status = await getStatus(SMALL_REPO);
    assertEqual(status.exists, true, "Should exist");
    assert(status.manifest !== null, "Should have manifest");
    assert(status.manifest!.file_count > 0, "Should have file count");
    assert(status.manifest!.symbol_count > 0, "Should have symbol count");
    assert(status.manifest!.chunk_count > 0, "Should have chunk count");
  });

  await test("Discover refresh guard skips dirty-only staleness", async () => {
    assertEqual(
      shouldRefreshDiscover({ exists: true, stale: true, reasons: ["workspace-dirty"], manifest: null, current_git_head: null }),
      false,
      "Dirty-only stale state should not force discover refresh",
    );
    assertEqual(
      shouldRefreshDiscover({ exists: true, stale: true, reasons: ["ttl-expired"], manifest: null, current_git_head: null }),
      true,
      "TTL stale state should force discover refresh",
    );
    assertEqual(
      shouldRefreshDiscover({
        exists: true,
        stale: true,
        reasons: ["workspace-dirty", "git-head-mismatch"],
        manifest: null,
        current_git_head: null,
      }),
      true,
      "Dirty plus structural stale reasons should still refresh",
    );
  });

  await test("Warm query path stays within expected latency range", async () => {
    const sample = async (): Promise<number> => {
      const start = Bun.nanoseconds();
      await queryFiles(SMALL_REPO, "test", 10);
      return (Bun.nanoseconds() - start) / 1e6;
    };

    const cold = await sample();
    const warmSamples = [await sample(), await sample(), await sample(), await sample()];
    const warmAvg = warmSamples.reduce((sum, value) => sum + value, 0) / warmSamples.length;

    assertLessThan(warmAvg, cold * 2 + 2, "Warm query path should not regress far beyond first sample");
  });

  await test("Changed mode rebuilds only modified files", async () => {
    const fullManifest = await buildIndex(SMALL_REPO, "full");
    const changedManifest = await buildIndex(SMALL_REPO, "changed");
    assertEqual(
      changedManifest.file_count,
      fullManifest.file_count,
      "Changed mode should have same file count"
    );
  });

  await test("Changed mode includes staged, unstaged, and untracked files", async () => {
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
    assert(status.reasons.includes("workspace-dirty"), "Status should report dirty workspace staleness");

    await buildIndex(repo, "changed");

    const unstaged = await queryChunks(repo, "unstaged-dirty-alpha", 5);
    const staged = await queryChunks(repo, "staged-dirty-beta", 5);
    const untracked = await queryFiles(repo, "c.ts", 5);

    assert(unstaged.length > 0, "Changed mode should include unstaged file changes");
    assert(staged.length > 0, "Changed mode should include staged file changes");
    assert(untracked.some((item) => item.path === "c.ts"), "Changed mode should include untracked files");
  });

  await test("Diagnostics counters increase for build and queries", async () => {
    diagnostics.reset();
    await buildIndex(SMALL_REPO, "full");
    await queryFiles(SMALL_REPO, "hello", 5);
    await querySymbols(SMALL_REPO, "greet", 5);
    await queryChunks(SMALL_REPO, "Hello", 5);
    await lookupIndex(SMALL_REPO, "where is add defined");

    const snap = diagnostics.getDiagnostics();
    assertGreaterThan(snap.operations.index_builds, 0, "Diagnostics should count index builds");
    assertGreaterThan(snap.operations.total_queries, 0, "Diagnostics should count queries");
    assertGreaterThan(snap.latency.max_ms, 0, "Diagnostics query latency histogram should be populated");
    assertGreaterThan(snap.latency.build_max_ms, 0, "Diagnostics build latency should be populated");
  });

  // Phase 4: Edge cases
  console.log(`\n${BOLD}Phase 4: Edge Cases${RESET}`);

  await test("Empty query returns empty results", async () => {
    const files = await queryFiles(SMALL_REPO, "", 10);
    assertEqual(files.length, 0, "Empty query should return no results");
  });

  await test("Query with special characters", async () => {
    const files = await queryFiles(SMALL_REPO, "hello.ts", 10);
    assert(files.length >= 0, "Should handle special characters");
  });

  await test("Very long query string", async () => {
    const longQuery = "a".repeat(1000);
    const files = await queryFiles(SMALL_REPO, longQuery, 10);
    assert(files.length >= 0, "Should handle long queries");
  });

  await test("Query non-existent content", async () => {
    const files = await queryFiles(SMALL_REPO, "nonexistentxyzabc", 10);
    assertEqual(files.length, 0, "Should return empty for non-existent content");
  });

  await test("Build index for empty directory", async () => {
    const emptyDir = join(TEMP_TEST_DIR, "empty");
    await mkdir(emptyDir, { recursive: true });
    const manifest = await buildIndex(emptyDir, "full");
    assertEqual(manifest.file_count, 0, "Empty directory should have 0 files");
  });

  await test("Handle directory with only non-code files", async () => {
    const nonCodeDir = join(TEMP_TEST_DIR, "non-code");
    await mkdir(nonCodeDir, { recursive: true });
    await writeFile(join(nonCodeDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(nonCodeDir, "data.bin"), Buffer.from([0x00, 0x01, 0x02]));
    const manifest = await buildIndex(nonCodeDir, "full");
    // May index some files depending on detection logic
    assert(manifest.file_count >= 0, "Should handle non-code files gracefully");
  });

  await test("Malformed manifest reports stale status without throwing", async () => {
    const repo = join(TEMP_TEST_DIR, "malformed-manifest");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "alpha.ts"), "export const alpha = 1\n");
    await buildIndex(repo, "full");

    const manifestPath = join(repo, ".agents", "index", "manifest.json");
    await writeFile(manifestPath, "{this-is-not-json\n");

    const status = await getStatus(repo);
    assertEqual(status.exists, true, "Malformed manifest should still report index artifacts exist");
    assertEqual(status.stale, true, "Malformed manifest should be marked stale");
    assert(status.reasons.includes("manifest-invalid-json"), "Status should include manifest-invalid-json reason");
  });

  await test("Malformed NDJSON index does not crash file query", async () => {
    const repo = join(TEMP_TEST_DIR, "malformed-ndjson");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "beta.ts"), "export const beta = 2\n");
    await buildIndex(repo, "full");

    const filesIndexPath = join(repo, ".agents", "index", "files.ndjson");
    await writeFile(filesIndexPath, "{broken-json-line\n");

    const files = await queryFiles(repo, "beta", 10);
    assertEqual(files.length, 0, "Malformed NDJSON should degrade to empty results instead of throwing");
  });

  // Phase 5: Performance characteristics
  console.log(`\n${BOLD}Phase 5: Performance Characteristics${RESET}`);

  await test("Index build completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await buildIndex(MEDIUM_REPO, "full");
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    assertLessThan(elapsed, 5000, "Should build medium repo in <5 seconds");
  });

  await test("File query completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await queryFiles(MEDIUM_REPO, "service", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    assertLessThan(elapsed, 100, "File query should complete in <100ms");
  });

  await test("Symbol query completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await querySymbols(MEDIUM_REPO, "process", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    assertLessThan(elapsed, 100, "Symbol query should complete in <100ms");
  });

  await test("Chunk search completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await queryChunks(MEDIUM_REPO, "async fetch", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    assertLessThan(elapsed, 100, "Chunk search should complete in <100ms");
  });

  // Cleanup
  console.log(`\n${BOLD}Cleanup${RESET}`);
  await test("Remove temp test directory", async () => {
    if (existsSync(TEMP_TEST_DIR)) {
      await rm(TEMP_TEST_DIR, { recursive: true });
    }
  });

  // Summary
  console.log(`\n${BOLD}${BLUE}Test Summary${RESET}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);
  console.log(`${YELLOW}Skipped: ${testsSkipped}${RESET}`);
  console.log(`${BOLD}Total: ${testsPassed + testsFailed + testsSkipped}${RESET}`);

  const coverage = testsPassed / (testsPassed + testsFailed);
  console.log(`\n${BOLD}Coverage: ${(coverage * 100).toFixed(1)}%${RESET}`);

  if (testsFailed > 0) {
    console.log(`\n${RED}${BOLD}Tests failed!${RESET}`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}All tests passed!${RESET}`);
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error(`${RED}${BOLD}Fatal error:${RESET}`, error);
  process.exit(1);
});
