import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { TopKHeap, getLru, setLru } from "./cache";
import { diagnostics } from "./diagnostics";
import { listIndexableFiles } from "./file-discovery";
import { getParserConfig, type ParserId } from "./grammar-manager";
import {
  applyChangedRecords,
  countsToManifest,
  getAllFilePaths,
  INDEX_DB_CORRUPT_REASON,
  indexDbExists,
  isIndexDbCorrupt,
  readAllRecords,
  readChunkCandidates,
  readCounts,
  readFileCandidates,
  readSymbolCandidates,
  replaceAllRecords,
} from "./index-db";
import { rankLookupResults, scoreChunk, scoreFile, scoreSymbol } from "./query";
import { relativeStateRoot, resolveIndexDir } from "./state-root";
import { extractSymbolsWithTreeSitter, missingRequiredParsers } from "./symbols-tree-sitter";
import type {
  BuildMode,
  ChunkRecord,
  FileRecord,
  InitWorkspaceIndexResult,
  IndexStatus,
  LookupResponse,
  Manifest,
  QueryIntent,
  ResolvedQueryIntent,
  SymbolRecord,
} from "./types";

const SCHEMA_VERSION = "2";
const DEFAULT_STALE_HOURS = 24;
const MAX_FILE_SIZE = 512 * 1024;
const CHUNK_SIZE_LINES = 120;
const CHUNK_OVERLAP_LINES = 20;
const BATCH_SIZE = 20;
const MAX_QUERY_CACHE_SIZE = 100;
const STATUS_CACHE_TTL_MS = 1500;
const MAX_STATUS_CACHE_SIZE = 64;
const MAX_QUERY_PARSE_CACHE = 256;

type ParsedQuery = {
  normalized: string;
  tokens: string[];
  pathTokens: string[];
  intent: ResolvedQueryIntent;
};

type QueryChunksOptions = {
  prefer_code?: boolean;
  path_prefix?: string;
  language?: string;
  intent?: QueryIntent;
  state_root?: string;
};

type DiscoverOptions = {
  files_limit?: number;
  symbols_limit?: number;
  search_limit?: number;
  prefer_code?: boolean;
  path_prefix?: string;
  language?: string;
  intent?: QueryIntent;
  state_root?: string;
};

const STATUS_CACHE = new Map<string, { value: IndexStatus; ts: number }>();
const QUERY_PARSE_CACHE = new Map<string, ParsedQuery>();
const QUERY_RESULT_CACHE = new Map<string, Map<string, unknown[]>>();

const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "not",
  "use",
  "using",
  "into",
  "only",
  "then",
  "just",
  "have",
  "has",
  "had",
  "please",
  "show",
  "find",
  "need",
  "want",
  "where",
  "which",
  "what",
  "help",
  "code",
  "file",
  "files",
  "repo",
  "project",
]);
const DOC_HINT_TOKENS = new Set(["doc", "docs", "readme", "markdown", "guide", "documentation"]);
const SYMBOL_HINT_TOKENS = new Set([
  "symbol",
  "symbols",
  "function",
  "class",
  "method",
  "type",
  "interface",
]);
const CODE_TOP_LEVEL_HINTS = new Set([
  "src",
  "lib",
  "app",
  "server",
  "cmd",
  "pkg",
  "modules",
  "hosts",
  "outputs",
  "scripts",
]);

function cacheKey(workspace: string, stateRoot?: string): string {
  return `${workspace}::${resolveIndexDir(workspace, stateRoot)}`;
}

function setStatusCache(key: string, value: IndexStatus): void {
  STATUS_CACHE.set(key, { value, ts: Date.now() });
  if (STATUS_CACHE.size > MAX_STATUS_CACHE_SIZE) {
    const first = STATUS_CACHE.keys().next().value;
    if (first) STATUS_CACHE.delete(first);
  }
}

function nowMs(): number {
  if (typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function") {
    return Bun.nanoseconds() / 1_000_000;
  }
  return Date.now();
}

function runGit(workspace: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", workspace, ...args], { encoding: "utf-8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function hasDirtyWorkspace(workspace: string): boolean {
  const raw = runGit(workspace, ["status", "--porcelain"]);
  if (raw === null) return false;
  return raw.length > 0;
}

function listDirtyFiles(workspace: string, baseHead: string | null): Set<string> {
  const out = new Set<string>();
  const addLines = (raw: string | null): void => {
    if (!raw) return;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  };

  if (baseHead) addLines(runGit(workspace, ["diff", "--name-only", `${baseHead}..HEAD`]));
  addLines(runGit(workspace, ["diff", "--name-only"]));
  addLines(runGit(workspace, ["diff", "--cached", "--name-only"]));
  addLines(runGit(workspace, ["ls-files", "--others", "--exclude-standard"]));
  return out;
}

function normalizeText(input: string): string {
  return input.toLowerCase();
}

function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  const tokens = normalized
    .split(/[^a-z0-9_./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 64)
    .filter((token) => !STOP_TOKENS.has(token));
  return [...new Set(tokens)];
}

function normalizeQuery(input: string): string {
  return normalizeText(input).replace(/\s+/g, " ").trim();
}

function resolveIntent(
  normalized: string,
  tokens: string[],
  requested: QueryIntent = "auto",
): ResolvedQueryIntent {
  if (requested !== "auto") return requested;
  if (
    tokens.some((token) => DOC_HINT_TOKENS.has(token)) ||
    normalized.includes("readme") ||
    normalized.includes("docs")
  )
    return "docs";
  if (tokens.some((token) => SYMBOL_HINT_TOKENS.has(token))) return "symbols";
  return "code";
}

function cacheParsedQuery(key: string, parsed: ParsedQuery): ParsedQuery {
  QUERY_PARSE_CACHE.set(key, parsed);
  if (QUERY_PARSE_CACHE.size > MAX_QUERY_PARSE_CACHE) {
    const first = QUERY_PARSE_CACHE.keys().next().value;
    if (first) QUERY_PARSE_CACHE.delete(first);
  }
  return parsed;
}

function parseQuery(input: string, intent: QueryIntent = "auto"): ParsedQuery {
  const key = `${intent}\u0000${input}`;
  const cached = QUERY_PARSE_CACHE.get(key);
  if (cached) return cached;

  const normalized = normalizeQuery(input);
  let tokens = tokenize(normalized);
  if (tokens.length === 0 && normalized) {
    tokens = [...new Set(normalized.split(/\s+/).filter((token) => token.length >= 2))];
  }
  const parsed: ParsedQuery = {
    normalized,
    tokens,
    pathTokens: tokens.filter((token) => token.includes("/") || token.includes(".")),
    intent: resolveIntent(normalized, tokens, intent),
  };
  return cacheParsedQuery(key, parsed);
}

function queryTerms(parsed: ParsedQuery): string[] {
  const terms = [parsed.normalized, ...parsed.tokens]
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2)
    .slice(0, 20);
  return [...new Set(terms)];
}

function codePathBias(pathLower: string): number {
  let score = 0;
  if (pathLower.endsWith(".md")) score -= 1.5;
  if (pathLower.endsWith(".lock")) score -= 2;
  if (pathLower.includes("/docs/")) score -= 1;
  if (pathLower.endsWith(".nix")) score += 1;
  if (pathLower.startsWith("src/") || pathLower.includes("/src/")) score += 1.5;
  if (pathLower.startsWith("lib/") || pathLower.includes("/lib/")) score += 1.2;
  return score;
}

function docsPathBias(pathLower: string): number {
  let score = 0;
  if (pathLower.endsWith(".md")) score += 2;
  if (pathLower.includes("/docs/")) score += 2;
  if (pathLower.endsWith("/readme.md") || pathLower === "readme.md") score += 3;
  return score;
}

function matchesLanguage(pathLower: string, languageFilter: string): boolean {
  if (!languageFilter) return true;
  if (languageFilter === "nix") return pathLower.endsWith(".nix");
  if (languageFilter === "typescript")
    return pathLower.endsWith(".ts") || pathLower.endsWith(".tsx");
  if (languageFilter === "javascript")
    return (
      pathLower.endsWith(".js") ||
      pathLower.endsWith(".jsx") ||
      pathLower.endsWith(".mjs") ||
      pathLower.endsWith(".cjs")
    );
  if (languageFilter === "markdown") return pathLower.endsWith(".md");
  return pathLower.endsWith(`.${languageFilter}`);
}

function hashText(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

function detectLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  )
    return "javascript";
  if (lower.endsWith(".nix")) return "nix";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".sh")) return "shell";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".rs")) return "rust";
  return "text";
}

function topLevel(path: string): string {
  return path.split("/")[0] || ".";
}

async function listFilesFallback(workspace: string, stateRoot?: string): Promise<string[]> {
  const out: string[] = [];
  const stateRootRel = relativeStateRoot(workspace, stateRoot);
  async function walk(abs: string): Promise<void> {
    const items = await readdir(abs, { withFileTypes: true });
    for (const item of items) {
      if (item.name === ".git" || item.name === "node_modules") continue;
      if (item.name === stateRootRel?.split("/")[0]) continue;
      const nextAbs = join(abs, item.name);
      if (item.isDirectory()) {
        await walk(nextAbs);
      } else if (item.isFile()) {
        out.push(relative(workspace, nextAbs));
      }
    }
  }
  await walk(workspace);
  return out;
}

function makeChunks(path: string, content: string): ChunkRecord[] {
  const lines = content.split("\n");
  const chunks: ChunkRecord[] = [];
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(lines.length, start + CHUNK_SIZE_LINES);
    chunks.push({
      id: `${path}:${String(start + 1)}-${String(end)}`,
      path,
      start_line: start + 1,
      end_line: end,
      content: lines.slice(start, end).join("\n"),
    });
    if (end === lines.length) break;
    start = Math.max(end - CHUNK_OVERLAP_LINES, start + 1);
  }
  return chunks;
}

function extractSymbolsRegex(path: string, language: string, content: string): SymbolRecord[] {
  const lines = content.split("\n");
  const symbols: SymbolRecord[] = [];
  const patterns: RegExp[] = [];
  if (language === "nix") {
    patterns.push(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:\{|\()/);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const re of patterns) {
      const m = line.match(re);
      if (!m?.[1]) continue;
      const name = m[1];
      const kind = line.includes("class")
        ? "class"
        : /type|interface/.test(line)
          ? "type"
          : "function";
      symbols.push({ path, line: i + 1, kind, name, signature_hint: line.trim().slice(0, 120) });
      break;
    }
  }
  return symbols;
}

function extractSymbols(
  path: string,
  language: string,
  content: string,
  enabledParsers: Set<ParserId>,
): SymbolRecord[] {
  const treeSitter = extractSymbolsWithTreeSitter(path, language, content, enabledParsers);
  if (treeSitter !== null) return treeSitter;
  return extractSymbolsRegex(path, language, content);
}

async function processFile(
  workspace: string,
  rel: string,
  enabledParsers: Set<ParserId>,
  stateRoot?: string,
): Promise<{ file: FileRecord | null; symbols: SymbolRecord[]; chunks: ChunkRecord[] }> {
  const stateRootRel = relativeStateRoot(workspace, stateRoot);
  if (stateRootRel && (rel === stateRootRel || rel.startsWith(`${stateRootRel}/`)))
    return { file: null, symbols: [], chunks: [] };
  if (rel.startsWith(".git/")) return { file: null, symbols: [], chunks: [] };

  const abs = join(workspace, rel);
  let st: import("node:fs").Stats;
  try {
    st = await stat(abs);
  } catch {
    return { file: null, symbols: [], chunks: [] };
  }
  if (!st.isFile()) return { file: null, symbols: [], chunks: [] };
  if (st.size > MAX_FILE_SIZE) return { file: null, symbols: [], chunks: [] };

  let content = "";
  try {
    content = await readFile(abs, "utf-8");
  } catch {
    return { file: null, symbols: [], chunks: [] };
  }
  if (content.includes("\u0000")) return { file: null, symbols: [], chunks: [] };

  const language = detectLanguage(rel);
  const fileRecord: FileRecord = {
    path: rel,
    language,
    size: st.size,
    hash: hashText(content),
    top_level: topLevel(rel),
  };
  return {
    file: fileRecord,
    symbols: extractSymbols(rel, language, content, enabledParsers),
    chunks: makeChunks(rel, content),
  };
}

async function computeForPaths(
  workspace: string,
  paths: string[],
  enabledParsers: Set<ParserId>,
  stateRoot?: string,
): Promise<{ files: FileRecord[]; symbols: SymbolRecord[]; chunks: ChunkRecord[] }> {
  const files: FileRecord[] = [];
  const symbols: SymbolRecord[] = [];
  const chunks: ChunkRecord[] = [];
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((rel) => processFile(workspace, rel, enabledParsers, stateRoot)),
    );
    for (const result of results) {
      if (!result.file) continue;
      files.push(result.file);
      symbols.push(...result.symbols);
      chunks.push(...result.chunks);
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  symbols.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.name.localeCompare(b.name),
  );
  chunks.sort((a, b) => a.path.localeCompare(b.path) || a.start_line - b.start_line);
  return { files, symbols, chunks };
}

function getQueryCache(workspace: string, stateRoot?: string): Map<string, unknown[]> {
  const key = cacheKey(workspace, stateRoot);
  let cache = QUERY_RESULT_CACHE.get(key);
  if (!cache) {
    cache = new Map<string, unknown[]>();
    QUERY_RESULT_CACHE.set(key, cache);
  }
  return cache;
}

function readCachedQuery(
  workspace: string,
  stateRoot: string | undefined,
  key: string,
): unknown[] | null {
  const cache = getQueryCache(workspace, stateRoot);
  const cached = getLru(cache, key);
  if (!cached) {
    diagnostics.recordCacheMiss();
    return null;
  }
  diagnostics.recordCacheHit();
  return cached;
}

function writeCachedQuery(
  workspace: string,
  stateRoot: string | undefined,
  key: string,
  value: unknown[],
): void {
  const cache = getQueryCache(workspace, stateRoot);
  setLru(cache, key, value, MAX_QUERY_CACHE_SIZE);
}

async function writeHumanDocs(
  workspace: string,
  files: FileRecord[],
  stateRoot?: string,
): Promise<void> {
  const byTop = new Map<string, number>();
  for (const file of files) {
    byTop.set(file.top_level, (byTop.get(file.top_level) ?? 0) + 1);
  }
  const dirsLines = ["# Directory Map", "", "Top-level directories by indexed file count:", ""];
  for (const [dir, count] of [...byTop.entries()].sort((a, b) => b[1] - a[1]))
    dirsLines.push(`- ${dir}: ${String(count)}`);
  dirsLines.push("");
  await writeFile(
    join(resolveIndexDir(workspace, stateRoot), "dirs.md"),
    dirsLines.join("\n"),
    "utf-8",
  );

  const entryCandidates = new Set([
    "README.md",
    "AGENTS.md",
    "flake.nix",
    "package.json",
    "tsconfig.json",
    "Cargo.toml",
    "go.mod",
  ]);
  const entryLines = ["# Entrypoints", "", "High-signal files for navigation:", ""];
  for (const path of files
    .filter(
      (f) => entryCandidates.has(f.path.split("/").at(-1) ?? "") || f.path.includes("/commands/"),
    )
    .map((f) => f.path)
    .slice(0, 200)) {
    entryLines.push(`- ${path}`);
  }
  entryLines.push("");
  await writeFile(
    join(resolveIndexDir(workspace, stateRoot), "entrypoints.md"),
    entryLines.join("\n"),
    "utf-8",
  );
}

export async function buildIndex(
  workspace: string,
  mode: BuildMode = "full",
  options: { state_root?: string } = {},
): Promise<Manifest> {
  const buildStart = nowMs();
  const indexDir = resolveIndexDir(workspace, options.state_root);
  await mkdir(indexDir, { recursive: true });

  const parserConfig = await getParserConfig(workspace, options.state_root);
  const enabledParsers = new Set<ParserId>(parserConfig.enabled);
  const missingParsers = missingRequiredParsers(enabledParsers);
  if (missingParsers.length > 0) {
    throw new Error(
      `Missing required parser runtimes for enabled built-ins: ${missingParsers.join(", ")}. Reinstall dependencies and rerun init/parser setup.`,
    );
  }

  const tracked = await listIndexableFiles(workspace, options.state_root);
  const gitHead = runGit(workspace, ["rev-parse", "HEAD"]);

  if (mode === "full") {
    const computed = await computeForPaths(workspace, tracked, enabledParsers, options.state_root);
    await replaceAllRecords(workspace, computed, options.state_root);
  } else {
    const prevStatus = await getStatus(workspace, options);
    if (
      !prevStatus.exists ||
      !prevStatus.manifest?.git_head ||
      prevStatus.reasons.includes(INDEX_DB_CORRUPT_REASON)
    ) {
      const computed = await computeForPaths(
        workspace,
        tracked,
        enabledParsers,
        options.state_root,
      );
      await replaceAllRecords(workspace, computed, options.state_root);
    } else {
      const changedSet = listDirtyFiles(workspace, prevStatus.manifest.git_head);
      const trackedSet = new Set(tracked);
      for (const prevPath of await getAllFilePaths(workspace, options.state_root)) {
        if (!trackedSet.has(prevPath)) changedSet.add(prevPath);
      }
      const recomputed = await computeForPaths(
        workspace,
        [...changedSet],
        enabledParsers,
        options.state_root,
      );
      await applyChangedRecords(workspace, changedSet, recomputed, options.state_root);
    }
  }

  const counts = await readCounts(workspace, options.state_root);
  const manifest = countsToManifest(workspace, gitHead, counts);
  manifest.schema_version = SCHEMA_VERSION;
  manifest.stale_after_hours = DEFAULT_STALE_HOURS;

  await writeFile(
    join(indexDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8",
  );
  const records = await readAllRecords(workspace, options.state_root);
  await writeHumanDocs(workspace, records.files, options.state_root);

  STATUS_CACHE.delete(cacheKey(workspace, options.state_root));
  QUERY_RESULT_CACHE.delete(cacheKey(workspace, options.state_root));
  diagnostics.recordIndexBuild();
  diagnostics.recordBuildLatency(nowMs() - buildStart);
  diagnostics.recordCacheInvalidation();
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return manifest;
}

export async function getStatus(
  workspace: string,
  options: { state_root?: string } = {},
): Promise<IndexStatus> {
  const key = cacheKey(workspace, options.state_root);
  const cached = STATUS_CACHE.get(key);
  if (cached && Date.now() - cached.ts < STATUS_CACHE_TTL_MS) {
    diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
    return cached.value;
  }

  const currentHead = runGit(workspace, ["rev-parse", "HEAD"]);
  const manifestPath = join(resolveIndexDir(workspace, options.state_root), "manifest.json");
  const hasDb = indexDbExists(workspace, options.state_root);

  if (!existsSync(manifestPath) || !hasDb) {
    const reasons = [!existsSync(manifestPath) ? "manifest-missing" : "index-db-missing"];
    if (hasDirtyWorkspace(workspace)) reasons.push("workspace-dirty");
    const status: IndexStatus = {
      exists: false,
      stale: true,
      reasons,
      manifest: null,
      current_git_head: currentHead,
    };
    setStatusCache(key, status);
    diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
    return status;
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;
  } catch {
    const malformed: IndexStatus = {
      exists: true,
      stale: true,
      reasons: ["manifest-invalid-json"],
      manifest: null,
      current_git_head: currentHead,
    };
    if (hasDirtyWorkspace(workspace)) malformed.reasons.push("workspace-dirty");
    setStatusCache(key, malformed);
    diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
    return malformed;
  }

  const reasons: string[] = [];
  if (await isIndexDbCorrupt(workspace, options.state_root)) reasons.push(INDEX_DB_CORRUPT_REASON);
  if (manifest.schema_version !== SCHEMA_VERSION) reasons.push("schema-version-mismatch");
  if (manifest.git_head !== currentHead) reasons.push("git-head-mismatch");
  if (hasDirtyWorkspace(workspace)) reasons.push("workspace-dirty");

  const generatedAt = Date.parse(manifest.generated_at);
  const ageMs = Date.now() - generatedAt;
  const staleAfterMs = manifest.stale_after_hours * 60 * 60 * 1000;
  if (Number.isFinite(generatedAt) && ageMs > staleAfterMs) reasons.push("ttl-expired");

  const status: IndexStatus = {
    exists: true,
    stale: reasons.length > 0,
    reasons,
    manifest,
    current_git_head: currentHead,
  };
  setStatusCache(key, status);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return status;
}

export function shouldRefreshDiscover(status: IndexStatus): boolean {
  if (!status.stale) return false;
  return status.reasons.some((reason) => reason !== "workspace-dirty");
}

export async function initWorkspaceIndex(
  workspace: string,
  options: { state_root?: string; mode?: BuildMode; refresh_if_stale?: boolean } = {},
): Promise<InitWorkspaceIndexResult> {
  const statusBefore = await getStatus(workspace, { state_root: options.state_root });
  const refreshIfStale = options.refresh_if_stale ?? true;
  const mode = options.mode ?? "changed";

  if (!refreshIfStale) {
    return {
      workspace,
      refreshed: false,
      reason: "refresh-disabled",
      mode: null,
      status_before: statusBefore,
      status_after: statusBefore,
      manifest: statusBefore.manifest,
    };
  }
  if (!statusBefore.stale) {
    return {
      workspace,
      refreshed: false,
      reason: "fresh",
      mode: null,
      status_before: statusBefore,
      status_after: statusBefore,
      manifest: statusBefore.manifest,
    };
  }
  if (!shouldRefreshDiscover(statusBefore)) {
    return {
      workspace,
      refreshed: false,
      reason: "dirty-only",
      mode: null,
      status_before: statusBefore,
      status_after: statusBefore,
      manifest: statusBefore.manifest,
    };
  }

  const manifest = await buildIndex(workspace, mode, { state_root: options.state_root });
  STATUS_CACHE.delete(cacheKey(workspace, options.state_root));
  const statusAfter = await getStatus(workspace, { state_root: options.state_root });
  return {
    workspace,
    refreshed: true,
    reason: "refreshed",
    mode,
    status_before: statusBefore,
    status_after: statusAfter,
    manifest,
  };
}

function rankFiles(items: FileRecord[], parsed: ParsedQuery, limit: number): FileRecord[] {
  const heap = new TopKHeap<number>(Math.max(0, limit));
  for (let i = 0; i < items.length; i++) {
    const pathLower = normalizeText(items[i]?.path ?? "");
    let score = pathLower.includes(parsed.normalized) ? 8 : 0;
    for (const token of parsed.tokens) {
      if (pathLower.includes(token)) score += token.includes("/") ? 3 : 1.5;
    }
    const top = normalizeText(items[i]?.top_level ?? "");
    if (parsed.intent === "code" && CODE_TOP_LEVEL_HINTS.has(top)) score += 0.6;
    if (parsed.intent === "docs") score += docsPathBias(pathLower);
    if (score > 0.5) heap.insert(i, score);
  }
  return heap
    .toSortedArray()
    .map((i) => items[i])
    .filter((item): item is FileRecord => Boolean(item));
}

function rankSymbols(items: SymbolRecord[], parsed: ParsedQuery, limit: number): SymbolRecord[] {
  const heap = new TopKHeap<number>(Math.max(0, limit));
  for (const [i, symbol] of items.entries()) {
    const nameLower = normalizeText(symbol.name);
    const pathLower = normalizeText(symbol.path);
    let score = nameLower.includes(parsed.normalized) ? 7 : 0;
    for (const token of parsed.tokens) {
      if (nameLower.includes(token)) score += 2;
      if (pathLower.includes(token)) score += 1;
    }
    if (parsed.intent === "symbols") score += 1.5;
    if (parsed.intent === "docs") score -= 1;
    if (score >= 1.5) heap.insert(i, score);
  }
  return heap
    .toSortedArray()
    .map((i) => items[i])
    .filter((item): item is SymbolRecord => Boolean(item));
}

function rankChunks(
  items: ChunkRecord[],
  parsed: ParsedQuery,
  limit: number,
  options: QueryChunksOptions,
): ChunkRecord[] {
  const languageFilter = options.language ? normalizeText(options.language) : "";
  const pathPrefix = options.path_prefix ? normalizeText(options.path_prefix) : "";
  const shouldPreferCode = options.prefer_code ?? parsed.intent !== "docs";
  const heap = new TopKHeap<number>(Math.max(0, limit));
  const topLevelHints = new Set<string>();
  for (const token of parsed.tokens) {
    if (CODE_TOP_LEVEL_HINTS.has(token)) topLevelHints.add(token);
    if (token.includes("/")) topLevelHints.add(token.split("/")[0] ?? "");
  }

  for (const [i, chunk] of items.entries()) {
    const pathLower = normalizeText(chunk.path);
    if (pathPrefix && !pathLower.startsWith(pathPrefix)) continue;
    if (!matchesLanguage(pathLower, languageFilter)) continue;
    const hay = normalizeText(`${chunk.path}\n${chunk.content}`);
    let score = hay.includes(parsed.normalized) ? 6 : 0;
    if (pathLower.includes(parsed.normalized)) score += 3;
    for (const token of parsed.tokens) {
      if (hay.includes(token)) score += 1.5;
    }
    for (const token of parsed.pathTokens) {
      if (pathLower.includes(token)) score += 3.5;
    }
    if (topLevelHints.has(pathLower.split("/")[0] ?? "")) score += 2.5;
    if (shouldPreferCode) score += codePathBias(pathLower);
    if (parsed.intent === "docs") score += docsPathBias(pathLower);
    if (score >= 2) heap.insert(i, score);
  }
  return heap
    .toSortedArray()
    .map((i) => items[i])
    .filter((item): item is ChunkRecord => Boolean(item));
}

export async function queryFiles(
  workspace: string,
  q: string,
  limit = 20,
  options: { state_root?: string } = {},
): Promise<FileRecord[]> {
  const start = nowMs();
  if (limit <= 0) return [];
  const parsed = parseQuery(q);
  if (!parsed.normalized) return [];

  const cacheKeyQuery = `files\u0000${parsed.intent}\u0000${parsed.normalized}\u0000${String(limit)}`;
  const cached = readCachedQuery(workspace, options.state_root, cacheKeyQuery) as
    | FileRecord[]
    | null;
  if (cached) return cached;

  const out = rankFiles(
    await readFileCandidates(
      workspace,
      {
        normalized: parsed.normalized,
        tokens: queryTerms(parsed),
        limit: Math.min(limit, 200),
      },
      options.state_root,
    ),
    parsed,
    Math.min(limit, 200),
  );
  writeCachedQuery(workspace, options.state_root, cacheKeyQuery, out);
  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return out;
}

export async function querySymbols(
  workspace: string,
  q: string,
  limit = 20,
  options: { state_root?: string } = {},
): Promise<SymbolRecord[]> {
  const start = nowMs();
  if (limit <= 0) return [];
  const parsed = parseQuery(q);
  if (!parsed.normalized) return [];

  const cacheKeyQuery = `symbols\u0000${parsed.intent}\u0000${parsed.normalized}\u0000${String(limit)}`;
  const cached = readCachedQuery(workspace, options.state_root, cacheKeyQuery) as
    | SymbolRecord[]
    | null;
  if (cached) return cached;

  const out = rankSymbols(
    await readSymbolCandidates(
      workspace,
      {
        normalized: parsed.normalized,
        tokens: queryTerms(parsed),
        limit: Math.min(limit, 200),
      },
      options.state_root,
    ),
    parsed,
    Math.min(limit, 200),
  );
  writeCachedQuery(workspace, options.state_root, cacheKeyQuery, out);
  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return out;
}

export async function queryChunks(
  workspace: string,
  q: string,
  limit = 10,
  options: QueryChunksOptions = {},
): Promise<ChunkRecord[]> {
  const start = nowMs();
  if (limit <= 0) return [];
  const parsed = parseQuery(q, options.intent);
  if (!parsed.normalized) return [];

  const cacheKeyQuery = [
    "chunks",
    parsed.intent,
    parsed.normalized,
    String(limit),
    String(options.prefer_code ?? ""),
    options.path_prefix ?? "",
    options.language ?? "",
  ].join("\u0000");
  const cached = readCachedQuery(workspace, options.state_root, cacheKeyQuery) as
    | ChunkRecord[]
    | null;
  if (cached) return cached;

  const out = rankChunks(
    await readChunkCandidates(
      workspace,
      {
        normalized: parsed.normalized,
        tokens: queryTerms(parsed),
        limit: Math.min(limit, 100),
        pathPrefix: options.path_prefix,
      },
      options.state_root,
    ),
    parsed,
    Math.min(limit, 100),
    options,
  );
  writeCachedQuery(workspace, options.state_root, cacheKeyQuery, out);
  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return out;
}

export async function discoverIndex(
  workspace: string,
  query: string,
  options: DiscoverOptions = {},
): Promise<{
  intent: ResolvedQueryIntent;
  files: FileRecord[];
  symbols: SymbolRecord[];
  chunks: ChunkRecord[];
}> {
  const parsed = parseQuery(query, options.intent);
  const files = await queryFiles(workspace, query, options.files_limit ?? 20, {
    state_root: options.state_root,
  });
  const symbols = await querySymbols(
    workspace,
    query,
    options.symbols_limit ?? (parsed.intent === "symbols" ? 40 : 20),
    { state_root: options.state_root },
  );
  const chunks = await queryChunks(workspace, query, options.search_limit ?? 10, {
    prefer_code: options.prefer_code,
    path_prefix: options.path_prefix,
    language: options.language,
    intent: parsed.intent,
    state_root: options.state_root,
  });
  return { intent: parsed.intent, files, symbols, chunks };
}

export async function lookupIndex(
  workspace: string,
  query: string,
  options: DiscoverOptions = {},
): Promise<LookupResponse> {
  const start = nowMs();
  const parsed = parseQuery(query, options.intent);

  const filesLimit = options.files_limit ?? 8;
  const symbolsLimit = options.symbols_limit ?? (parsed.intent === "symbols" ? 20 : 12);
  const searchLimit = options.search_limit ?? (parsed.intent === "docs" ? 10 : 8);
  const preferCode = options.prefer_code ?? parsed.intent !== "docs";

  let filesParsed = parsed;
  let symbolsParsed = parsed;
  let chunksParsed = parsed;

  let files = await queryFiles(workspace, query, filesLimit, { state_root: options.state_root });
  let symbols = await querySymbols(workspace, query, symbolsLimit, {
    state_root: options.state_root,
  });
  let chunks = await queryChunks(workspace, query, searchLimit, {
    prefer_code: preferCode,
    path_prefix: options.path_prefix,
    language: options.language,
    intent: parsed.intent,
    state_root: options.state_root,
  });

  let fallbackStage: LookupResponse["fallback"]["stage"] = "none";
  let fallbackDetail = "Primary lookup strategy returned complete result groups";

  if (symbols.length === 0 && parsed.intent !== "docs") {
    symbolsParsed = parseQuery(query, "symbols");
    symbols = await querySymbols(workspace, query, symbolsLimit, {
      state_root: options.state_root,
    });
    if (symbols.length > 0) {
      fallbackStage = "symbols";
      fallbackDetail = "Primary strategy had no symbol hits, retried with symbol-focused routing";
    }
  }

  if (chunks.length === 0 && parsed.intent !== "docs") {
    chunksParsed = parseQuery(query, "code");
    chunks = await queryChunks(workspace, query, searchLimit, {
      prefer_code: true,
      path_prefix: options.path_prefix,
      language: options.language,
      intent: "code",
      state_root: options.state_root,
    });
    if (chunks.length > 0) {
      fallbackStage = fallbackStage === "none" ? "chunks" : "all";
      fallbackDetail = "Primary strategy had no chunk hits, retried with code-focused routing";
    }
  }

  if (files.length === 0) {
    filesParsed = parseQuery(query, "code");
    files = await queryFiles(workspace, query, filesLimit, { state_root: options.state_root });
    if (files.length > 0) {
      fallbackStage = fallbackStage === "none" ? "files" : "all";
      fallbackDetail = "Primary strategy had no file hits, retried with broad path routing";
    }
  }

  const response: LookupResponse = {
    intent: parsed.intent,
    files: rankLookupResults(files, (item) => scoreFile(item.path, filesParsed), {
      label: "fallback-file-match",
      detail: "File returned by fallback retrieval path",
    }),
    symbols: rankLookupResults(symbols, (item) => scoreSymbol(item, symbolsParsed), {
      label: "fallback-symbol-match",
      detail: "Symbol returned by fallback retrieval path",
    }),
    chunks: rankLookupResults(chunks, (item) => scoreChunk(item, chunksParsed), {
      label: "fallback-chunk-match",
      detail: "Chunk returned by fallback retrieval path",
    }),
    fallback: {
      used: fallbackStage !== "none",
      stage: fallbackStage,
      detail: fallbackDetail,
    },
  };

  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return response;
}

export const __internal = {
  TopKHeap,
  listFilesFallback,
  scoreFile,
  scoreSymbol,
  scoreChunk,
};
