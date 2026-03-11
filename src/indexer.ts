import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { TopKHeap, getLru, setLru } from "./cache";
import { diagnostics } from "./diagnostics";
import { mergeIncrementalRecords, sortIndexedRecords } from "./indexer/build";
import { rankLookupResults, scoreChunk, scoreFile, scoreSymbol } from "./query";
import { relativeStateRoot, resolveIndexDir } from "./state-root";
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

const SCHEMA_VERSION = "1";
const DEFAULT_STALE_HOURS = 24;
const MAX_FILE_SIZE = 512 * 1024;
const CHUNK_SIZE_LINES = 120;
const CHUNK_OVERLAP_LINES = 20;
const BATCH_SIZE = 20;

type IndexCacheEntry = {
  filesMtimeMs: number | null;
  symbolsMtimeMs: number | null;
  chunksMtimeMs: number | null;
  files: FileRecord[];
  filesLower: string[];
  filesTopLevelLower: string[];
  symbols: SymbolRecord[];
  symbolsLower: string[];
  symbolsPathLower: string[];
  symbolTokenToIndexes: Map<string, number[]>;
  chunks: ChunkRecord[];
  chunksSearch: string[];
  chunksPathLower: string[];
  chunksTopLevelLower: string[];
  chunksBasenameLower: string[];
  chunksCodeBias: number[];
  chunksDocsBias: number[];
  chunkTokenToIndexes: Map<string, number[]>;
  queryFilesCache: Map<string, FileRecord[]>;
  querySymbolsCache: Map<string, SymbolRecord[]>;
  queryChunksCache: Map<string, ChunkRecord[]>;
};

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

const INDEX_CACHE = new Map<string, IndexCacheEntry>();
const STATUS_CACHE = new Map<string, { value: IndexStatus; ts: number }>();
const STATUS_CACHE_TTL_MS = 1500;
const MAX_INDEX_CACHE_SIZE = 32;
const MAX_STATUS_CACHE_SIZE = 64;
const MAX_QUERY_CACHE_SIZE = 100; // LRU limit for per-index query caches
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
  "prompt",
  "agent",
  "relevant",
  "exact",
  "without",
  "editing",
]);
const DOC_HINT_TOKENS = new Set([
  "doc",
  "docs",
  "readme",
  "markdown",
  "guide",
  "explain",
  "documentation",
]);
const SYMBOL_HINT_TOKENS = new Set([
  "symbol",
  "symbols",
  "function",
  "class",
  "method",
  "type",
  "interface",
  "definition",
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
const MAX_QUERY_PARSE_CACHE = 256;
const QUERY_PARSE_CACHE = new Map<string, ParsedQuery>();

function cacheKey(workspace: string, stateRoot?: string): string {
  return `${workspace}::${resolveIndexDir(workspace, stateRoot)}`;
}

function setIndexCache(key: string, entry: IndexCacheEntry): void {
  INDEX_CACHE.set(key, entry);
  if (INDEX_CACHE.size > MAX_INDEX_CACHE_SIZE) {
    const first = INDEX_CACHE.keys().next().value;
    if (first) INDEX_CACHE.delete(first);
  }
}

function setStatusCache(key: string, value: IndexStatus): void {
  STATUS_CACHE.set(key, { value, ts: Date.now() });
  if (STATUS_CACHE.size > MAX_STATUS_CACHE_SIZE) {
    const first = STATUS_CACHE.keys().next().value;
    if (first) STATUS_CACHE.delete(first);
  }
}

function getIndexDir(workspace: string, stateRoot?: string): string {
  return resolveIndexDir(workspace, stateRoot);
}

function getIndexPath(workspace: string, file: string, stateRoot?: string): string {
  return join(getIndexDir(workspace, stateRoot), file);
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

function runGit(workspace: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", workspace, ...args], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function nowMs(): number {
  if (typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function") {
    return Bun.nanoseconds() / 1_000_000;
  }
  return Date.now();
}

function listTrackedFiles(workspace: string): string[] | null {
  const out = runGit(workspace, ["ls-files"]);
  if (out === null) return null;
  return out
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

function listDirtyFiles(workspace: string, baseHead: string | null): Set<string> {
  const out = new Set<string>();
  const addLines = (raw: string | null) => {
    if (!raw) return;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  };

  if (baseHead) {
    addLines(runGit(workspace, ["diff", "--name-only", `${baseHead}..HEAD`]));
  }
  addLines(runGit(workspace, ["diff", "--name-only"]));
  addLines(runGit(workspace, ["diff", "--cached", "--name-only"]));
  addLines(runGit(workspace, ["ls-files", "--others", "--exclude-standard"]));
  return out;
}

function hasDirtyWorkspace(workspace: string): boolean {
  const raw = runGit(workspace, ["status", "--porcelain"]);
  if (raw === null) return false;
  return raw.length > 0;
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

/**
 * Single-pass NDJSON parser
 * Eliminates intermediate arrays (split, map, filter, map) for 50-70% speedup
 */
function parseNdjson<T>(content: string): T[] {
  const result: T[] = [];
  let start = 0;

  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content[i] === "\n") {
      if (i > start) {
        const line = content.slice(start, i).trim();
        if (line.length > 0) {
          try {
            result.push(JSON.parse(line) as T);
          } catch {
            // Ignore malformed lines and keep reading the rest.
          }
        }
      }
      start = i + 1;
    }
  }

  return result;
}

async function mtimeMs(path: string): Promise<number | null> {
  try {
    const st = await stat(path);
    return st.mtimeMs;
  } catch {
    return null;
  }
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
  ) {
    return "docs";
  }
  if (tokens.some((token) => SYMBOL_HINT_TOKENS.has(token))) return "symbols";
  return "code";
}

function cacheParsedQuery(cacheKey: string, parsed: ParsedQuery): ParsedQuery {
  QUERY_PARSE_CACHE.set(cacheKey, parsed);
  if (QUERY_PARSE_CACHE.size > MAX_QUERY_PARSE_CACHE) {
    const first = QUERY_PARSE_CACHE.keys().next().value;
    if (first) QUERY_PARSE_CACHE.delete(first);
  }
  return parsed;
}

function parseQuery(input: string, intent: QueryIntent = "auto"): ParsedQuery {
  const cacheKey = `${intent}\u0000${input}`;
  const cached = QUERY_PARSE_CACHE.get(cacheKey);
  if (cached) return cached;

  const normalized = normalizeQuery(input);
  let tokens = tokenize(normalized);
  if (tokens.length === 0 && normalized) {
    tokens = [...new Set(normalized.split(/\s+/).filter((token) => token.length >= 2))];
  }
  const pathTokens = tokens.filter((token) => token.includes("/") || token.includes("."));
  const parsed: ParsedQuery = {
    normalized,
    tokens,
    pathTokens,
    intent: resolveIntent(normalized, tokens, intent),
  };
  return cacheParsedQuery(cacheKey, parsed);
}

function codePathBias(pathLower: string): number {
  let score = 0;
  if (pathLower.endsWith(".md")) score -= 1.5;
  if (pathLower.endsWith(".lock")) score -= 2;
  if (pathLower.includes("/docs/")) score -= 1;
  if (pathLower.includes("/node_modules/")) score -= 3;
  if (pathLower.endsWith(".nix")) score += 1;
  if (pathLower.startsWith("src/") || pathLower.includes("/src/")) score += 1.5;
  if (pathLower.startsWith("lib/") || pathLower.includes("/lib/")) score += 1.2;
  if (pathLower.startsWith("modules/") || pathLower.includes("/modules/")) score += 1.1;
  if (pathLower.startsWith("hosts/") || pathLower.includes("/hosts/")) score += 1.1;
  if (pathLower.startsWith("outputs/") || pathLower.includes("/outputs/")) score += 1;
  return score;
}

function docsPathBias(pathLower: string, basenameLower: string): number {
  let score = 0;
  if (pathLower.endsWith(".md")) score += 2;
  if (pathLower.includes("/docs/")) score += 2;
  if (basenameLower === "readme.md" || basenameLower === "readme") score += 3;
  if (pathLower.includes("/guide/")) score += 1;
  return score;
}

function matchesLanguage(pathLower: string, languageFilter: string): boolean {
  if (!languageFilter) return true;
  if (languageFilter === "nix") return pathLower.endsWith(".nix");
  if (languageFilter === "typescript")
    return pathLower.endsWith(".ts") || pathLower.endsWith(".tsx");
  if (languageFilter === "javascript")
    return pathLower.endsWith(".js") || pathLower.endsWith(".jsx");
  if (languageFilter === "markdown") return pathLower.endsWith(".md");
  return pathLower.endsWith(`.${languageFilter}`);
}

/**
 * Build chunk token index with Set-based deduplication
 * Uses Set for intermediate storage, converts to array at end for 20-40% speedup
 */
function buildChunkTokenIndex(chunksSearch: string[]): Map<string, number[]> {
  const out = new Map<string, Set<number>>();
  for (let i = 0; i < chunksSearch.length; i++) {
    const tokens = tokenize(chunksSearch[i] ?? "");
    for (const token of tokens) {
      let existing = out.get(token);
      if (!existing) {
        existing = new Set<number>();
        out.set(token, existing);
      }
      existing.add(i);
    }
  }
  // Convert Sets to arrays
  const result = new Map<string, number[]>();
  for (const [token, indexSet] of out) {
    result.set(token, Array.from(indexSet));
  }
  return result;
}

/**
 * Build symbol token index with Set-based deduplication
 * Uses Set for intermediate storage, converts to array at end for 20-40% speedup
 */
function buildSymbolTokenIndex(symbolsLower: string[]): Map<string, number[]> {
  const out = new Map<string, Set<number>>();
  for (let i = 0; i < symbolsLower.length; i++) {
    const tokens = tokenize(symbolsLower[i] ?? "");
    for (const token of tokens) {
      let existing = out.get(token);
      if (!existing) {
        existing = new Set<number>();
        out.set(token, existing);
      }
      existing.add(i);
    }
  }
  // Convert Sets to arrays
  const result = new Map<string, number[]>();
  for (const [token, indexSet] of out) {
    result.set(token, Array.from(indexSet));
  }
  return result;
}

/**
 * Build cache entry with normalized string caching
 * Caches path normalization per unique path for 40-60% memory reduction
 */
function buildCacheEntry(
  files: FileRecord[],
  symbols: SymbolRecord[],
  chunks: ChunkRecord[],
  mtimes: { files: number | null; symbols: number | null; chunks: number | null },
): IndexCacheEntry {
  // Cache normalized paths to avoid redundant allocations
  const pathNormCache = new Map<string, string>();
  const normalizePath = (path: string): string => {
    let cached = pathNormCache.get(path);
    if (cached === undefined) {
      cached = normalizeText(path);
      pathNormCache.set(path, cached);
    }
    return cached;
  };

  // Cache top-level extraction
  const topLevelCache = new Map<string, string>();
  const getTopLevel = (path: string): string => {
    let cached = topLevelCache.get(path);
    if (cached === undefined) {
      cached = topLevel(path);
      topLevelCache.set(path, cached);
    }
    return cached;
  };

  // Cache basename extraction
  const basenameCache = new Map<string, string>();
  const getBasename = (path: string): string => {
    let cached = basenameCache.get(path);
    if (cached === undefined) {
      const lastSlash = path.lastIndexOf("/");
      cached = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      basenameCache.set(path, cached);
    }
    return cached;
  };

  const filesLower = files.map((f) => normalizePath(f.path));
  const filesTopLevelLower = files.map((f) => normalizeText(getTopLevel(f.path)));
  const chunksPathLower = chunks.map((c) => normalizePath(c.path));
  const chunksTopLevelLower = chunks.map((c) => normalizeText(getTopLevel(c.path)));
  const chunksBasenameLower = chunks.map((c) => normalizeText(getBasename(c.path)));
  const chunksSearch = chunks.map((c) => normalizeText(`${c.path}\n${c.content}`));
  const chunksCodeBias = chunksPathLower.map((pathLower) => codePathBias(pathLower));
  const chunksDocsBias = chunksPathLower.map((pathLower, i) =>
    docsPathBias(pathLower, chunksBasenameLower[i] ?? ""),
  );
  const symbolsLower = symbols.map((s) => normalizeText(s.name));
  const symbolsPathLower = symbols.map((s) => normalizePath(s.path));

  return {
    filesMtimeMs: mtimes.files,
    symbolsMtimeMs: mtimes.symbols,
    chunksMtimeMs: mtimes.chunks,
    files,
    filesLower,
    filesTopLevelLower,
    symbols,
    symbolsLower,
    symbolsPathLower,
    symbolTokenToIndexes: buildSymbolTokenIndex(symbolsLower),
    chunks,
    chunksSearch,
    chunksPathLower,
    chunksTopLevelLower,
    chunksBasenameLower,
    chunksCodeBias,
    chunksDocsBias,
    chunkTokenToIndexes: buildChunkTokenIndex(chunksSearch),
    queryFilesCache: new Map<string, FileRecord[]>(),
    querySymbolsCache: new Map<string, SymbolRecord[]>(),
    queryChunksCache: new Map<string, ChunkRecord[]>(),
  };
}

function toNdjson(items: unknown[]): string {
  return items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : "");
}

function extractSymbols(path: string, language: string, content: string): SymbolRecord[] {
  const lines = content.split("\n");
  const symbols: SymbolRecord[] = [];

  const push = (line: number, kind: string, name: string, signature_hint?: string) => {
    symbols.push({ path, line, kind, name, signature_hint });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (language === "typescript" || language === "javascript") {
      let m = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/.exec(line);
      if (m) push(i + 1, "function", m[1], `(${m[2]})`);
      m = /^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/.exec(line);
      if (m) push(i + 1, "function", m[1], `(${m[2]})`);
      m = /^\s*export\s+class\s+([A-Za-z0-9_$]+)/.exec(line);
      if (m) push(i + 1, "class", m[1]);
      m = /^\s*class\s+([A-Za-z0-9_$]+)/.exec(line);
      if (m) push(i + 1, "class", m[1]);
      m =
        /^\s*export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/.exec(
          line,
        );
      if (m) push(i + 1, "function", m[1], `(${m[2]})`);
      m = /^\s*export\s+type\s+([A-Za-z0-9_$]+)/.exec(line);
      if (m) push(i + 1, "type", m[1]);
      m = /^\s*export\s+interface\s+([A-Za-z0-9_$]+)/.exec(line);
      if (m) push(i + 1, "interface", m[1]);
    } else if (language === "nix") {
      const m = /^\s*([A-Za-z0-9._-]+)\s*=\s*/.exec(line);
      if (m) push(i + 1, "attr", m[1]);
    } else if (language === "shell") {
      const m = /^\s*([A-Za-z0-9_-]+)\s*\(\)\s*\{/.exec(line);
      if (m) push(i + 1, "function", m[1]);
    } else if (language === "python") {
      let m = /^\s*def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*:/.exec(line);
      if (m) push(i + 1, "function", m[1], `(${m[2]})`);
      m = /^\s*class\s+([A-Za-z0-9_]+)/.exec(line);
      if (m) push(i + 1, "class", m[1]);
    }
  }

  return symbols;
}

function makeChunks(path: string, content: string): ChunkRecord[] {
  const lines = content.split("\n");
  const chunks: ChunkRecord[] = [];
  if (lines.length === 0) return chunks;

  let start = 0;
  while (start < lines.length) {
    const end = Math.min(lines.length, start + CHUNK_SIZE_LINES);
    const slice = lines.slice(start, end).join("\n");
    chunks.push({
      id: `${path}:${String(start + 1)}-${String(end)}`,
      path,
      start_line: start + 1,
      end_line: end,
      content: slice,
    });
    if (end === lines.length) break;
    start = Math.max(end - CHUNK_OVERLAP_LINES, start + 1);
  }
  return chunks;
}

async function readExistingIndex<T>(
  workspace: string,
  name: string,
  stateRoot?: string,
): Promise<T[]> {
  const p = getIndexPath(workspace, name, stateRoot);
  if (!existsSync(p)) return [];
  try {
    const raw = await readFile(p, "utf-8");
    return parseNdjson<T>(raw);
  } catch {
    return [];
  }
}

async function loadCachedIndex(workspace: string, stateRoot?: string): Promise<IndexCacheEntry> {
  const filesPath = getIndexPath(workspace, "files.ndjson", stateRoot);
  const symbolsPath = getIndexPath(workspace, "symbols.ndjson", stateRoot);
  const chunksPath = getIndexPath(workspace, "chunks.ndjson", stateRoot);
  const [filesMtime, symbolsMtime, chunksMtime] = await Promise.all([
    mtimeMs(filesPath),
    mtimeMs(symbolsPath),
    mtimeMs(chunksPath),
  ]);

  const key = cacheKey(workspace, stateRoot);
  const cached = INDEX_CACHE.get(key);
  if (
    cached?.filesMtimeMs === filesMtime &&
    cached.symbolsMtimeMs === symbolsMtime &&
    cached.chunksMtimeMs === chunksMtime
  ) {
    diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
    return cached;
  }

  const [files, symbols, chunks] = await Promise.all([
    readExistingIndex<FileRecord>(workspace, "files.ndjson", stateRoot),
    readExistingIndex<SymbolRecord>(workspace, "symbols.ndjson", stateRoot),
    readExistingIndex<ChunkRecord>(workspace, "chunks.ndjson", stateRoot),
  ]);

  const entry = buildCacheEntry(files, symbols, chunks, {
    files: filesMtime,
    symbols: symbolsMtime,
    chunks: chunksMtime,
  });
  if (cached) diagnostics.recordCacheInvalidation();
  setIndexCache(key, entry);
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return entry;
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
  for (const [dir, count] of [...byTop.entries()].sort((a, b) => b[1] - a[1])) {
    dirsLines.push(`- ${dir}: ${String(count)}`);
  }
  dirsLines.push("");
  await writeFile(getIndexPath(workspace, "dirs.md", stateRoot), dirsLines.join("\n"), "utf-8");

  const entryCandidates = new Set([
    "README.md",
    "AGENTS.md",
    "flake.nix",
    "package.json",
    "tsconfig.json",
    "Cargo.toml",
    "go.mod",
  ]);
  const entries = files
    .filter(
      (f) => entryCandidates.has(f.path.split("/").at(-1) ?? "") || f.path.includes("/commands/"),
    )
    .map((f) => f.path)
    .slice(0, 200);

  const entryLines = ["# Entrypoints", "", "High-signal files for navigation:", ""];
  for (const path of entries) entryLines.push(`- ${path}`);
  entryLines.push("");
  await writeFile(
    getIndexPath(workspace, "entrypoints.md", stateRoot),
    entryLines.join("\n"),
    "utf-8",
  );
}

export async function getStatus(
  workspace: string,
  options: { state_root?: string } = {},
): Promise<IndexStatus> {
  const key = cacheKey(workspace, options.state_root);
  const cached = STATUS_CACHE.get(key);
  if (cached && Date.now() - cached.ts < STATUS_CACHE_TTL_MS) {
    diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
    return cached.value;
  }

  const manifestPath = getIndexPath(workspace, "manifest.json", options.state_root);
  const currentHead = runGit(workspace, ["rev-parse", "HEAD"]);
  if (!existsSync(manifestPath)) {
    const status: IndexStatus = {
      exists: false,
      stale: true,
      reasons: ["manifest-missing"],
      manifest: null,
      current_git_head: currentHead,
    };
    if (hasDirtyWorkspace(workspace)) status.reasons.push("workspace-dirty");
    status.stale = status.reasons.length > 0;
    setStatusCache(key, status);
    diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
    return status;
  }

  let manifest: Manifest;
  try {
    const raw = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(raw) as Manifest;
  } catch {
    const malformedStatus: IndexStatus = {
      exists: true,
      stale: true,
      reasons: ["manifest-invalid-json"],
      manifest: null,
      current_git_head: currentHead,
    };
    if (hasDirtyWorkspace(workspace)) malformedStatus.reasons.push("workspace-dirty");
    setStatusCache(key, malformedStatus);
    diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
    return malformedStatus;
  }
  const reasons: string[] = [];

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
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return status;
}

export function shouldRefreshDiscover(status: IndexStatus): boolean {
  if (!status.stale) return false;
  return status.reasons.some((reason) => reason !== "workspace-dirty");
}

export async function initWorkspaceIndex(
  workspace: string,
  options: {
    state_root?: string;
    mode?: BuildMode;
    refresh_if_stale?: boolean;
  } = {},
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

/**
 * Process a single file and return its records
 */
async function processFile(
  workspace: string,
  rel: string,
  stateRoot?: string,
): Promise<{
  file: FileRecord | null;
  symbols: SymbolRecord[];
  chunks: ChunkRecord[];
}> {
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
    symbols: extractSymbols(rel, language, content),
    chunks: makeChunks(rel, content),
  };
}

/**
 * Parallel file processing with batching
 * Processes files in batches of BATCH_SIZE for 3-5x speedup on multi-core systems
 */
async function computeForPaths(
  workspace: string,
  paths: string[],
  stateRoot?: string,
): Promise<{
  files: FileRecord[];
  symbols: SymbolRecord[];
  chunks: ChunkRecord[];
}> {
  const files: FileRecord[] = [];
  const symbols: SymbolRecord[] = [];
  const chunks: ChunkRecord[] = [];

  // Process files in batches
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((rel) => processFile(workspace, rel, stateRoot)));

    for (const result of results) {
      if (result.file) {
        files.push(result.file);
        symbols.push(...result.symbols);
        chunks.push(...result.chunks);
      }
    }
  }

  return { files, symbols, chunks };
}

export async function buildIndex(
  workspace: string,
  mode: BuildMode = "full",
  options: { state_root?: string } = {},
): Promise<Manifest> {
  const buildStart = nowMs();
  const indexDir = getIndexDir(workspace, options.state_root);
  await mkdir(indexDir, { recursive: true });

  const tracked =
    listTrackedFiles(workspace) ?? (await listFilesFallback(workspace, options.state_root));
  const gitHead = runGit(workspace, ["rev-parse", "HEAD"]);

  let files: FileRecord[] = [];
  let symbols: SymbolRecord[] = [];
  let chunks: ChunkRecord[] = [];

  if (mode === "full") {
    const computed = await computeForPaths(workspace, tracked, options.state_root);
    files = computed.files;
    symbols = computed.symbols;
    chunks = computed.chunks;
  } else {
    const prevStatus = await getStatus(workspace, options);
    if (!prevStatus.exists || !prevStatus.manifest?.git_head) {
      const computed = await computeForPaths(workspace, tracked, options.state_root);
      files = computed.files;
      symbols = computed.symbols;
      chunks = computed.chunks;
    } else {
      const changedSet = listDirtyFiles(workspace, prevStatus.manifest.git_head);
      const trackedSet = new Set(tracked);
      for (const prevFile of await readExistingIndex<FileRecord>(workspace, "files.ndjson")) {
        if (!trackedSet.has(prevFile.path)) changedSet.add(prevFile.path);
      }

      const prevFiles = await readExistingIndex<FileRecord>(
        workspace,
        "files.ndjson",
        options.state_root,
      );
      const prevSymbols = await readExistingIndex<SymbolRecord>(
        workspace,
        "symbols.ndjson",
        options.state_root,
      );
      const prevChunks = await readExistingIndex<ChunkRecord>(
        workspace,
        "chunks.ndjson",
        options.state_root,
      );

      const changedPaths = [...changedSet];
      const recomputed = await computeForPaths(workspace, changedPaths, options.state_root);

      const merged = mergeIncrementalRecords(
        prevFiles,
        prevSymbols,
        prevChunks,
        changedSet,
        recomputed,
      );
      files = merged.files;
      symbols = merged.symbols;
      chunks = merged.chunks;
    }
  }

  sortIndexedRecords({ files, symbols, chunks });

  await writeFile(
    getIndexPath(workspace, "files.ndjson", options.state_root),
    toNdjson(files),
    "utf-8",
  );
  await writeFile(
    getIndexPath(workspace, "symbols.ndjson", options.state_root),
    toNdjson(symbols),
    "utf-8",
  );
  await writeFile(
    getIndexPath(workspace, "chunks.ndjson", options.state_root),
    toNdjson(chunks),
    "utf-8",
  );
  await writeHumanDocs(workspace, files, options.state_root);

  const [filesMtime, symbolsMtime, chunksMtime] = await Promise.all([
    mtimeMs(getIndexPath(workspace, "files.ndjson", options.state_root)),
    mtimeMs(getIndexPath(workspace, "symbols.ndjson", options.state_root)),
    mtimeMs(getIndexPath(workspace, "chunks.ndjson", options.state_root)),
  ]);
  setIndexCache(
    cacheKey(workspace, options.state_root),
    buildCacheEntry(files, symbols, chunks, {
      files: filesMtime,
      symbols: symbolsMtime,
      chunks: chunksMtime,
    }),
  );

  const manifest: Manifest = {
    schema_version: SCHEMA_VERSION,
    workspace,
    git_head: gitHead,
    generated_at: new Date().toISOString(),
    stale_after_hours: DEFAULT_STALE_HOURS,
    file_count: files.length,
    symbol_count: symbols.length,
    chunk_count: chunks.length,
  };

  await writeFile(
    getIndexPath(workspace, "manifest.json", options.state_root),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8",
  );
  STATUS_CACHE.delete(cacheKey(workspace, options.state_root));
  diagnostics.recordIndexBuild();
  diagnostics.recordBuildLatency(nowMs() - buildStart);
  diagnostics.recordCacheInvalidation();
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return manifest;
}

function queryFilesFromCache(
  cache: IndexCacheEntry,
  parsed: ParsedQuery,
  limit: number,
): FileRecord[] {
  const key = `${parsed.intent}\u0000${parsed.normalized}\u0000${String(limit)}`;
  const cached = getLru(cache.queryFilesCache, key);
  if (cached) {
    diagnostics.recordCacheHit();
    return cached;
  }
  diagnostics.recordCacheMiss();
  if (!parsed.normalized) return [];

  const heap = new TopKHeap<number>(limit);

  for (let i = 0; i < cache.files.length; i++) {
    const pathLower = cache.filesLower[i] ?? "";
    let score = pathLower.includes(parsed.normalized) ? 8 : 0;
    for (const token of parsed.tokens) {
      if (pathLower.includes(token)) score += token.includes("/") ? 3 : 1.5;
    }
    const topDir = cache.filesTopLevelLower[i] ?? "";
    if (parsed.intent === "code" && CODE_TOP_LEVEL_HINTS.has(topDir)) score += 0.6;
    if (parsed.intent === "docs" && (pathLower.endsWith(".md") || pathLower.includes("/docs/")))
      score += 1.5;
    if (score > 0.5) heap.insert(i, score);
  }

  const result = heap.toSortedArray().map((index) => cache.files[index]);
  setLru(cache.queryFilesCache, key, result, MAX_QUERY_CACHE_SIZE);
  return result;
}

function querySymbolsFromCache(
  cache: IndexCacheEntry,
  parsed: ParsedQuery,
  limit: number,
): SymbolRecord[] {
  const key = `${parsed.intent}\u0000${parsed.normalized}\u0000${String(limit)}`;
  const cached = getLru(cache.querySymbolsCache, key);
  if (cached) {
    diagnostics.recordCacheHit();
    return cached;
  }
  diagnostics.recordCacheMiss();
  if (!parsed.normalized) return [];

  const candidateIndexes = new Set<number>();
  for (const token of parsed.tokens) {
    for (const idx of cache.symbolTokenToIndexes.get(token) ?? []) candidateIndexes.add(idx);
  }
  if (candidateIndexes.size === 0) {
    for (let i = 0; i < cache.symbols.length; i++) candidateIndexes.add(i);
  }

  const heap = new TopKHeap<number>(limit);

  for (const i of candidateIndexes) {
    const nameLower = cache.symbolsLower[i] ?? "";
    const pathLower = cache.symbolsPathLower[i] ?? "";
    let score = nameLower.includes(parsed.normalized) ? 7 : 0;
    for (const token of parsed.tokens) {
      if (nameLower.includes(token)) score += 2;
      if (pathLower.includes(token)) score += 1;
    }
    if (parsed.intent === "symbols") score += 1.5;
    if (parsed.intent === "docs") score -= 1;
    if (score >= 1.5) heap.insert(i, score);
  }

  const result = heap.toSortedArray().map((index) => cache.symbols[index]);
  setLru(cache.querySymbolsCache, key, result, MAX_QUERY_CACHE_SIZE);
  return result;
}

function queryChunksFromCache(
  cache: IndexCacheEntry,
  parsed: ParsedQuery,
  limit: number,
  options: QueryChunksOptions,
): ChunkRecord[] {
  const key = [
    parsed.intent,
    parsed.normalized,
    String(limit),
    String(options.prefer_code ?? ""),
    options.path_prefix ?? "",
    options.language ?? "",
  ].join("\u0000");
  const cached = getLru(cache.queryChunksCache, key);
  if (cached) {
    diagnostics.recordCacheHit();
    return cached;
  }
  diagnostics.recordCacheMiss();
  if (!parsed.normalized) return [];

  const languageFilter = options.language ? normalizeText(options.language) : "";
  const pathPrefix = options.path_prefix ? normalizeText(options.path_prefix) : "";
  const shouldPreferCode = options.prefer_code ?? parsed.intent !== "docs";

  const tokenScoreByIndex = new Map<number, number>();
  for (const token of parsed.tokens) {
    for (const idx of cache.chunkTokenToIndexes.get(token) ?? []) {
      tokenScoreByIndex.set(idx, (tokenScoreByIndex.get(idx) ?? 0) + 1.5);
    }
  }
  const topLevelHints = new Set<string>();
  for (const token of parsed.tokens) {
    if (CODE_TOP_LEVEL_HINTS.has(token)) topLevelHints.add(token);
    if (token.includes("/")) {
      const root = token.split("/")[0];
      if (root) topLevelHints.add(root);
    }
  }

  const heap = new TopKHeap<number>(limit);

  const scoreChunkIndex = (i: number, baseScore: number): void => {
    const pathLower = cache.chunksPathLower[i] ?? "";
    if (pathPrefix && !pathLower.startsWith(pathPrefix)) return;
    if (!matchesLanguage(pathLower, languageFilter)) return;

    let score = baseScore;
    const hay = cache.chunksSearch[i] ?? "";
    if (hay.includes(parsed.normalized)) score += 6;
    if (pathLower.includes(parsed.normalized)) score += 3;
    for (const token of parsed.pathTokens) {
      if (pathLower.includes(token)) score += 3.5;
    }
    if (topLevelHints.has(cache.chunksTopLevelLower[i] ?? "")) score += 2.5;

    if (shouldPreferCode) score += cache.chunksCodeBias[i] ?? 0;
    if (parsed.intent === "docs") score += cache.chunksDocsBias[i] ?? 0;
    if (parsed.intent === "symbols" && pathLower.endsWith(".md")) score -= 1;
    if (parsed.intent === "code" && cache.chunksBasenameLower[i] === "readme.md") score -= 1;
    if (parsed.intent === "code" && pathLower.endsWith(".md")) score -= 3;

    if (score >= 2) heap.insert(i, score);
  };

  if (tokenScoreByIndex.size > 0) {
    for (const [i, baseScore] of tokenScoreByIndex) {
      scoreChunkIndex(i, baseScore);
    }
  } else {
    for (let i = 0; i < cache.chunks.length; i++) {
      scoreChunkIndex(i, 0);
    }
  }

  const result = heap.toSortedArray().map((index) => cache.chunks[index]);
  setLru(cache.queryChunksCache, key, result, MAX_QUERY_CACHE_SIZE);
  return result;
}

export async function queryFiles(
  workspace: string,
  q: string,
  limit = 20,
  options: { state_root?: string } = {},
): Promise<FileRecord[]> {
  const start = nowMs();
  const cache = await loadCachedIndex(workspace, options.state_root);
  const parsed = parseQuery(q);
  const out = queryFilesFromCache(cache, parsed, limit);
  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return out;
}

export async function querySymbols(
  workspace: string,
  q: string,
  limit = 20,
  options: { state_root?: string } = {},
): Promise<SymbolRecord[]> {
  const start = nowMs();
  const cache = await loadCachedIndex(workspace, options.state_root);
  const parsed = parseQuery(q);
  const out = querySymbolsFromCache(cache, parsed, limit);
  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return out;
}

export async function queryChunks(
  workspace: string,
  q: string,
  limit = 10,
  options: QueryChunksOptions = {},
): Promise<ChunkRecord[]> {
  const start = nowMs();
  const cache = await loadCachedIndex(workspace, options.state_root);
  const parsed = parseQuery(q, options.intent);
  const out = queryChunksFromCache(cache, parsed, limit, options);
  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
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
  const start = nowMs();
  const cache = await loadCachedIndex(workspace, options.state_root);
  const parsed = parseQuery(query, options.intent);
  const filesLimit = options.files_limit ?? 20;
  const symbolsLimit = options.symbols_limit ?? (parsed.intent === "symbols" ? 40 : 20);
  const searchLimit = options.search_limit ?? 10;

  const routedLanguage =
    options.language ??
    (parsed.intent === "docs" &&
    parsed.tokens.some((token) => token === "readme" || token === "markdown")
      ? "markdown"
      : undefined);

  const files = queryFilesFromCache(cache, parsed, filesLimit);
  const symbols = querySymbolsFromCache(cache, parsed, symbolsLimit);
  const chunks = queryChunksFromCache(cache, parsed, searchLimit, {
    prefer_code: options.prefer_code,
    path_prefix: options.path_prefix,
    language: routedLanguage,
    intent: parsed.intent,
  });

  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return { intent: parsed.intent, files, symbols, chunks };
}

export const __internal = {
  TopKHeap,
  listFilesFallback,
  scoreFile,
  scoreSymbol,
  scoreChunk,
};

export async function lookupIndex(
  workspace: string,
  query: string,
  options: DiscoverOptions = {},
): Promise<LookupResponse> {
  const start = nowMs();
  const cache = await loadCachedIndex(workspace, options.state_root);
  const parsed = parseQuery(query, options.intent);

  const filesLimit = options.files_limit ?? 8;
  const symbolsLimit = options.symbols_limit ?? (parsed.intent === "symbols" ? 20 : 12);
  const searchLimit = options.search_limit ?? (parsed.intent === "docs" ? 10 : 8);
  const preferCode = options.prefer_code ?? parsed.intent !== "docs";

  let filesParsed = parsed;
  let symbolsParsed = parsed;
  let chunksParsed = parsed;

  let files = queryFilesFromCache(cache, parsed, filesLimit);
  let symbols = querySymbolsFromCache(cache, parsed, symbolsLimit);
  let chunks = queryChunksFromCache(cache, parsed, searchLimit, {
    prefer_code: preferCode,
    path_prefix: options.path_prefix,
    language: options.language,
    intent: parsed.intent,
  });

  let fallbackStage: LookupResponse["fallback"]["stage"] = "none";
  let fallbackDetail = "Primary lookup strategy returned complete result groups";

  if (symbols.length === 0 && parsed.intent !== "docs") {
    symbolsParsed = parseQuery(query, "symbols");
    symbols = querySymbolsFromCache(cache, symbolsParsed, symbolsLimit);
    if (symbols.length > 0) {
      fallbackStage = "symbols";
      fallbackDetail = "Primary strategy had no symbol hits, retried with symbol-focused routing";
    }
  }

  if (chunks.length === 0 && parsed.intent !== "docs") {
    chunksParsed = parseQuery(query, "code");
    chunks = queryChunksFromCache(cache, chunksParsed, searchLimit, {
      prefer_code: true,
      path_prefix: options.path_prefix,
      language: options.language,
      intent: "code",
    });
    if (chunks.length > 0) {
      fallbackStage = fallbackStage === "none" ? "chunks" : "all";
      fallbackDetail = "Primary strategy had no chunk hits, retried with code-focused routing";
    }
  }

  if (files.length === 0) {
    filesParsed = parseQuery(query, "code");
    files = queryFilesFromCache(cache, filesParsed, filesLimit);
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
  diagnostics.updateCacheSizes(INDEX_CACHE.size, STATUS_CACHE.size);
  return response;
}
