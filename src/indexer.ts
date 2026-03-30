import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { TopKHeap, getLru, setLru } from "./cache";
import { diagnostics } from "./diagnostics";
import { listIndexableFiles } from "./file-discovery";
import {
  allowGlobalRuntimeFallbackForParser,
  getParserConfig,
  getRuntimeInstallFailedParsers,
  languageSupportById,
  resolveGrammarRuntimeRoot,
  runtimePackageInstalled,
  type ParserId,
} from "./grammar-manager";
import {
  applyChangedRecords,
  countsToManifest,
  getAllFilePaths,
  INDEX_DB_CORRUPT_REASON,
  indexDbExists,
  isIndexDbCorrupt,
  readAllRecords,
  readChunkById,
  readChunkCandidates,
  readCounts,
  readFileCandidates,
  readLanguageCounts,
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
  WorkspaceIndexResult,
  IndexStatus,
  LookupResponse,
  Manifest,
  QueryIntent,
  ResolvedQueryIntent,
  SymbolRecord,
  GrammarSuggestion,
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
const DEFAULT_CHUNK_PREVIEW_CHARS = 240;

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
  content_mode?: "none" | "preview" | "full";
  include_content?: boolean;
  content_max_chars?: number;
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
  content_mode?: "none" | "preview" | "full";
  include_content?: boolean;
  content_max_chars?: number;
  response_mode?: "full" | "compact";
  state_root?: string;
};

function resolveContentMode(options: {
  content_mode?: "none" | "preview" | "full";
  include_content?: boolean;
}): "none" | "preview" | "full" {
  if (
    options.content_mode === "none" ||
    options.content_mode === "preview" ||
    options.content_mode === "full"
  ) {
    return options.content_mode;
  }
  if (options.include_content === true) return "full";
  return "preview";
}

function toCompactLookupReasons<T extends { reasons: { label: string; detail: string }[] }>(
  rows: T[],
): T[] {
  return rows.map((row) => ({
    ...row,
    reasons: row.reasons.length > 0 ? [{ label: row.reasons[0]?.label ?? "", detail: "" }] : [],
  }));
}

const STATUS_CACHE = new Map<string, { value: IndexStatus; ts: number }>();
const QUERY_PARSE_CACHE = new Map<string, ParsedQuery>();
const QUERY_RESULT_CACHE = new Map<string, Map<string, unknown[]>>();
const BUILD_LOCKS = new Map<string, Promise<void>>();
const REFRESH_IN_FLIGHT = new Map<string, Promise<Manifest>>();

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

function workspaceIndexKey(workspace: string, stateRoot?: string): string {
  return cacheKey(workspace, stateRoot);
}

async function withWorkspaceBuildLock<T>(
  workspace: string,
  stateRoot: string | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const key = workspaceIndexKey(workspace, stateRoot);
  const previous = BUILD_LOCKS.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  BUILD_LOCKS.set(key, queued);
  await previous;
  try {
    return await action();
  } finally {
    const releaseFn = release;
    if (releaseFn) releaseFn();
    if (BUILD_LOCKS.get(key) === queued) {
      BUILD_LOCKS.delete(key);
    }
  }
}

async function refreshWorkspaceIndexSingleFlight(
  workspace: string,
  mode: BuildMode,
  stateRoot?: string,
): Promise<Manifest> {
  const key = workspaceIndexKey(workspace, stateRoot);
  const existing = REFRESH_IN_FLIGHT.get(key);
  if (existing) return existing;
  const run = buildIndex(workspace, mode, { state_root: stateRoot }).finally(() => {
    if (REFRESH_IN_FLIGHT.get(key) === run) {
      REFRESH_IN_FLIGHT.delete(key);
    }
  });
  REFRESH_IN_FLIGHT.set(key, run);
  return run;
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

type GitProbeResult = { ok: true; stdout: string } | { ok: false; timedOut: boolean };

async function runGit(
  workspace: string,
  args: string[],
  timeoutMs = 5000,
): Promise<GitProbeResult> {
  return await new Promise((resolve) => {
    let resolved = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const child = spawn("git", ["-C", workspace, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    const resolveOnce = (value: GitProbeResult): void => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 150);
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolveOnce({ ok: false, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (timedOut || code !== 0) {
        resolveOnce({ ok: false, timedOut });
        return;
      }
      resolveOnce({ ok: true, stdout: stdout.trim() });
    });
  });
}

async function hasDirtyWorkspace(
  workspace: string,
): Promise<{ dirty: boolean; degraded: boolean }> {
  const raw = await runGit(workspace, ["status", "--porcelain"]);
  if (!raw.ok) {
    return { dirty: true, degraded: true };
  }
  return { dirty: raw.stdout.length > 0, degraded: false };
}

async function listDirtyFiles(
  workspace: string,
  baseHead: string | null,
): Promise<{ files: Set<string>; degraded: boolean }> {
  const out = new Set<string>();
  let degraded = false;
  const addLines = (probe: GitProbeResult): void => {
    if (!probe.ok) {
      degraded = true;
      return;
    }
    for (const line of probe.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  };

  if (baseHead) addLines(await runGit(workspace, ["diff", "--name-only", `${baseHead}..HEAD`]));
  addLines(await runGit(workspace, ["diff", "--name-only"]));
  addLines(await runGit(workspace, ["diff", "--cached", "--name-only"]));
  addLines(await runGit(workspace, ["ls-files", "--others", "--exclude-standard"]));
  return { files: out, degraded };
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
  if (languageFilter === "elixir") return pathLower.endsWith(".ex") || pathLower.endsWith(".exs");
  if (languageFilter === "zig") return pathLower.endsWith(".zig");
  if (languageFilter === "c-sharp") return pathLower.endsWith(".cs");
  if (languageFilter === "cpp") {
    return (
      pathLower.endsWith(".cc") ||
      pathLower.endsWith(".cpp") ||
      pathLower.endsWith(".cxx") ||
      pathLower.endsWith(".hpp") ||
      pathLower.endsWith(".hh") ||
      pathLower.endsWith(".hxx")
    );
  }
  if (languageFilter === "c") return pathLower.endsWith(".c") || pathLower.endsWith(".h");
  if (languageFilter === "java") return pathLower.endsWith(".java");
  if (languageFilter === "php") return pathLower.endsWith(".php") || pathLower.endsWith(".phtml");
  if (languageFilter === "ruby") return pathLower.endsWith(".rb");
  if (languageFilter === "lua") return pathLower.endsWith(".lua");
  if (languageFilter === "kotlin") return pathLower.endsWith(".kt") || pathLower.endsWith(".kts");
  if (languageFilter === "swift") return pathLower.endsWith(".swift");
  if (languageFilter === "typescript")
    return pathLower.endsWith(".ts") || pathLower.endsWith(".tsx");
  if (languageFilter === "javascript")
    return (
      pathLower.endsWith(".js") ||
      pathLower.endsWith(".jsx") ||
      pathLower.endsWith(".mjs") ||
      pathLower.endsWith(".cjs")
    );
  if (languageFilter === "markdown")
    return (
      pathLower.endsWith(".md") || pathLower.endsWith(".markdown") || pathLower.endsWith(".mdown")
    );
  return pathLower.endsWith(`.${languageFilter}`);
}

function hashText(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

const EXTENSION_LANGUAGE_ALIAS: Record<string, string> = {
  ex: "elixir",
  exs: "elixir",
  cs: "c-sharp",
  csharp: "c-sharp",
  cjs: "javascript",
  mjs: "javascript",
  jsx: "javascript",
  tsx: "typescript",
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  rb: "ruby",
  kts: "kotlin",
};

function detectLanguage(path: string, enabledParsers: Set<ParserId>): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  )
    return "javascript";
  if (lower.endsWith(".ex") || lower.endsWith(".exs")) return "elixir";
  if (lower.endsWith(".zig")) return "zig";
  if (
    lower.endsWith(".cc") ||
    lower.endsWith(".cpp") ||
    lower.endsWith(".cxx") ||
    lower.endsWith(".hpp") ||
    lower.endsWith(".hh") ||
    lower.endsWith(".hxx")
  )
    return "cpp";
  if (lower.endsWith(".cs")) return "c-sharp";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".php") || lower.endsWith(".phtml")) return "php";
  if (lower.endsWith(".rb")) return "ruby";
  if (lower.endsWith(".lua")) return "lua";
  if (lower.endsWith(".kt") || lower.endsWith(".kts")) return "kotlin";
  if (lower.endsWith(".swift")) return "swift";
  if (lower.endsWith(".c") || lower.endsWith(".h")) return "c";
  if (lower.endsWith(".nix")) return "nix";
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdown"))
    return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".sh")) return "shell";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".rs")) return "rust";
  const extension = lower.includes(".") ? (lower.split(".").at(-1) ?? "") : "";
  if (extension) {
    const aliased = EXTENSION_LANGUAGE_ALIAS[extension] ?? extension;
    if (enabledParsers.has(aliased)) return aliased;
  }
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
      symbols.push({
        path,
        line: i + 1,
        kind,
        name,
        signature_hint: line.trim().slice(0, 120),
      });
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
  runtimeRoots: string[],
  globalFallbackAllowedParsers: Set<ParserId>,
): SymbolRecord[] {
  const treeSitter = extractSymbolsWithTreeSitter(
    path,
    language,
    content,
    enabledParsers,
    runtimeRoots,
    globalFallbackAllowedParsers,
  );
  if (treeSitter !== null) return treeSitter;
  return extractSymbolsRegex(path, language, content);
}

async function processFile(
  workspace: string,
  rel: string,
  enabledParsers: Set<ParserId>,
  runtimeRoots: string[],
  globalFallbackAllowedParsers: Set<ParserId>,
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

  const language = detectLanguage(rel, enabledParsers);
  const fileRecord: FileRecord = {
    path: rel,
    language,
    size: st.size,
    hash: hashText(content),
    top_level: topLevel(rel),
  };
  return {
    file: fileRecord,
    symbols: extractSymbols(
      rel,
      language,
      content,
      enabledParsers,
      runtimeRoots,
      globalFallbackAllowedParsers,
    ),
    chunks: makeChunks(rel, content),
  };
}

async function computeForPaths(
  workspace: string,
  paths: string[],
  enabledParsers: Set<ParserId>,
  runtimeRoots: string[],
  globalFallbackAllowedParsers: Set<ParserId>,
  stateRoot?: string,
): Promise<{
  files: FileRecord[];
  symbols: SymbolRecord[];
  chunks: ChunkRecord[];
}> {
  const files: FileRecord[] = [];
  const symbols: SymbolRecord[] = [];
  const chunks: ChunkRecord[] = [];
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((rel) =>
        processFile(
          workspace,
          rel,
          enabledParsers,
          runtimeRoots,
          globalFallbackAllowedParsers,
          stateRoot,
        ),
      ),
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

async function grammarSuggestionsForWorkspace(
  workspace: string,
  stateRoot?: string,
): Promise<GrammarSuggestion[]> {
  if (!indexDbExists(workspace, stateRoot)) return [];
  const parserConfig = await getParserConfig(workspace, stateRoot);
  const enabledParsers = new Set(parserConfig.enabled);
  const runtimeInstallFailed = new Set(await getRuntimeInstallFailedParsers(workspace, stateRoot));
  const counts = await readLanguageCounts(workspace, stateRoot);
  const suggestions: GrammarSuggestion[] = [];
  for (const row of counts) {
    if (suggestions.length >= 5) break;
    const language = row.language.trim().toLowerCase();
    const support = languageSupportById(language);
    if (!support || !support.installable) continue;
    const parserId = support.parser_id;
    const isEnabled = enabledParsers.has(parserId);
    const runtimeInstalled = runtimePackageInstalled(parserId, workspace, stateRoot, {
      allow_global_fallback: allowGlobalRuntimeFallbackForParser(parserId, runtimeInstallFailed),
    });
    const reason = !isEnabled ? "parser-disabled" : !runtimeInstalled ? "runtime-missing" : null;
    if (!reason) continue;
    suggestions.push({
      language,
      parser_id: parserId,
      files: row.count,
      reason,
      runtime_package: support.runtime_package,
      install_tool: "veil_grammar_runtime_install",
      install_args: { parsers: [parserId] },
    });
  }
  return suggestions;
}

async function withGrammarSuggestions(
  workspace: string,
  status: IndexStatus,
  stateRoot?: string,
): Promise<IndexStatus> {
  if (!status.exists) {
    return {
      ...status,
      grammar_suggestions: [],
    };
  }
  try {
    const grammarSuggestions = await grammarSuggestionsForWorkspace(workspace, stateRoot);
    return {
      ...status,
      grammar_suggestions: grammarSuggestions,
    };
  } catch {
    return {
      ...status,
      grammar_suggestions: [],
    };
  }
}

async function buildIndexUnlocked(
  workspace: string,
  mode: BuildMode = "full",
  options: { state_root?: string } = {},
): Promise<Manifest> {
  const buildStart = nowMs();
  const indexDir = resolveIndexDir(workspace, options.state_root);
  await mkdir(indexDir, { recursive: true });

  const parserConfig = await getParserConfig(workspace, options.state_root);
  const enabledParsers = new Set<ParserId>(parserConfig.enabled);
  const runtimeInstallFailed = new Set(
    await getRuntimeInstallFailedParsers(workspace, options.state_root),
  );
  const globalFallbackAllowedParsers = new Set(
    [...enabledParsers].filter((parserId) =>
      allowGlobalRuntimeFallbackForParser(parserId, runtimeInstallFailed),
    ),
  );
  const runtimeRoots = [resolveGrammarRuntimeRoot(workspace, options.state_root)];
  const missingParsers = missingRequiredParsers(
    enabledParsers,
    runtimeRoots,
    globalFallbackAllowedParsers,
  );
  if (missingParsers.length > 0) {
    throw new Error(
      `Missing required parser runtimes for enabled built-ins: ${missingParsers.join(", ")}. Reinstall dependencies and rerun build.`,
    );
  }

  const tracked = await listIndexableFiles(workspace, options.state_root);
  const gitHeadProbe = await runGit(workspace, ["rev-parse", "HEAD"]);
  const gitHead = gitHeadProbe.ok ? gitHeadProbe.stdout : null;
  let shouldWriteDocs = mode === "full";

  if (mode === "full") {
    const computed = await computeForPaths(
      workspace,
      tracked,
      enabledParsers,
      runtimeRoots,
      globalFallbackAllowedParsers,
      options.state_root,
    );
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
        runtimeRoots,
        globalFallbackAllowedParsers,
        options.state_root,
      );
      await replaceAllRecords(workspace, computed, options.state_root);
      shouldWriteDocs = true;
    } else {
      const dirtyProbe = await listDirtyFiles(workspace, prevStatus.manifest.git_head);
      const trackedSet = new Set(tracked);
      for (const prevPath of await getAllFilePaths(workspace, options.state_root)) {
        if (!trackedSet.has(prevPath)) dirtyProbe.files.add(prevPath);
      }
      if (dirtyProbe.degraded) {
        const recomputedAll = await computeForPaths(
          workspace,
          tracked,
          enabledParsers,
          runtimeRoots,
          globalFallbackAllowedParsers,
          options.state_root,
        );
        await replaceAllRecords(workspace, recomputedAll, options.state_root);
        shouldWriteDocs = true;
      } else if (dirtyProbe.files.size > 0) {
        const recomputed = await computeForPaths(
          workspace,
          [...dirtyProbe.files],
          enabledParsers,
          runtimeRoots,
          globalFallbackAllowedParsers,
          options.state_root,
        );
        await applyChangedRecords(workspace, dirtyProbe.files, recomputed, options.state_root);
        shouldWriteDocs = true;
      }
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
  if (shouldWriteDocs) {
    const records = await readAllRecords(workspace, options.state_root);
    await writeHumanDocs(workspace, records.files, options.state_root);
  }

  STATUS_CACHE.delete(cacheKey(workspace, options.state_root));
  QUERY_RESULT_CACHE.delete(cacheKey(workspace, options.state_root));
  diagnostics.recordIndexBuild();
  diagnostics.recordBuildLatency(nowMs() - buildStart);
  diagnostics.recordCacheInvalidation();
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return manifest;
}

export async function buildIndex(
  workspace: string,
  mode: BuildMode = "full",
  options: { state_root?: string } = {},
): Promise<Manifest> {
  return withWorkspaceBuildLock(workspace, options.state_root, async () =>
    buildIndexUnlocked(workspace, mode, options),
  );
}

export async function getStatus(
  workspace: string,
  options: { state_root?: string; bypass_cache?: boolean } = {},
): Promise<IndexStatus> {
  const key = cacheKey(workspace, options.state_root);
  const cached = STATUS_CACHE.get(key);
  if (!options.bypass_cache && cached && Date.now() - cached.ts < STATUS_CACHE_TTL_MS) {
    diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
    return cached.value;
  }

  const currentHeadProbe = await runGit(workspace, ["rev-parse", "HEAD"]);
  const currentHead = currentHeadProbe.ok ? currentHeadProbe.stdout : null;
  const manifestPath = join(resolveIndexDir(workspace, options.state_root), "manifest.json");
  const hasDb = indexDbExists(workspace, options.state_root);

  if (!existsSync(manifestPath) || !hasDb) {
    const reasons = [!existsSync(manifestPath) ? "manifest-missing" : "index-db-missing"];
    const workspaceState = await hasDirtyWorkspace(workspace);
    if (workspaceState.dirty) reasons.push("workspace-dirty");
    const status: IndexStatus = {
      exists: false,
      stale: true,
      reasons,
      manifest: null,
      current_git_head: currentHead,
    };
    const withSuggestions = await withGrammarSuggestions(workspace, status, options.state_root);
    setStatusCache(key, withSuggestions);
    diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
    return withSuggestions;
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
    const workspaceState = await hasDirtyWorkspace(workspace);
    if (workspaceState.dirty) malformed.reasons.push("workspace-dirty");
    const withSuggestions = await withGrammarSuggestions(workspace, malformed, options.state_root);
    setStatusCache(key, withSuggestions);
    diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
    return withSuggestions;
  }

  const reasons: string[] = [];
  if (await isIndexDbCorrupt(workspace, options.state_root)) reasons.push(INDEX_DB_CORRUPT_REASON);
  if (manifest.schema_version !== SCHEMA_VERSION) reasons.push("schema-version-mismatch");
  if (manifest.git_head !== currentHead) reasons.push("git-head-mismatch");
  const workspaceState = await hasDirtyWorkspace(workspace);
  if (workspaceState.dirty) reasons.push("workspace-dirty");

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
  const withSuggestions = await withGrammarSuggestions(workspace, status, options.state_root);
  setStatusCache(key, withSuggestions);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return withSuggestions;
}

export function shouldRefreshDiscover(status: IndexStatus): boolean {
  if (!status.stale) return false;
  return status.reasons.some((reason) => reason !== "workspace-dirty");
}

export async function prepareWorkspaceIndex(
  workspace: string,
  options: {
    state_root?: string;
    mode?: BuildMode;
    refresh_if_stale?: boolean;
    strict_query_freshness?: boolean;
  } = {},
): Promise<WorkspaceIndexResult> {
  const strictQueryFreshness = options.strict_query_freshness === true;
  const statusBefore = await getStatus(workspace, {
    state_root: options.state_root,
    bypass_cache: strictQueryFreshness,
  });
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
  if (!strictQueryFreshness && !shouldRefreshDiscover(statusBefore)) {
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

  const manifest = await refreshWorkspaceIndexSingleFlight(workspace, mode, options.state_root);
  STATUS_CACHE.delete(cacheKey(workspace, options.state_root));
  const statusAfter = await getStatus(workspace, {
    state_root: options.state_root,
    bypass_cache: strictQueryFreshness,
  });
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
    const hay = normalizeText(`${chunk.path}\n${chunk.content ?? ""}`);
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

function normalizeContentMaxChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_CHUNK_PREVIEW_CHARS;
  }
  return Math.max(40, Math.min(20000, Math.floor(value)));
}

function projectChunk(
  chunk: ChunkRecord,
  contentMode: "none" | "preview" | "full",
  contentMaxChars?: number,
): ChunkRecord {
  const content = chunk.content ?? "";
  const fullLength = content.length;
  if (contentMode === "full") {
    if (
      typeof contentMaxChars === "number" &&
      Number.isFinite(contentMaxChars) &&
      contentMaxChars > 0
    ) {
      const limit = normalizeContentMaxChars(contentMaxChars);
      if (fullLength > limit) {
        return {
          ...chunk,
          content: content.slice(0, limit),
          content_truncated: true,
          content_chars: fullLength,
        };
      }
    }
    return {
      ...chunk,
      content_truncated: false,
      content_chars: fullLength,
    };
  }

  if (contentMode === "none") {
    return {
      id: chunk.id,
      path: chunk.path,
      start_line: chunk.start_line,
      end_line: chunk.end_line,
      content_truncated: true,
      content_chars: fullLength,
    };
  }

  const limit = normalizeContentMaxChars(contentMaxChars);
  const truncated = fullLength > limit;
  return {
    ...chunk,
    content: truncated ? content.slice(0, limit) : content,
    content_truncated: truncated,
    content_chars: fullLength,
  };
}

function projectChunks(
  chunks: ChunkRecord[],
  contentMode: "none" | "preview" | "full",
  contentMaxChars?: number,
): ChunkRecord[] {
  return chunks.map((chunk) => projectChunk(chunk, contentMode, contentMaxChars));
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
    resolveContentMode(options),
    String(options.content_max_chars ?? ""),
    options.path_prefix ?? "",
    options.language ?? "",
  ].join("\u0000");
  const cached = readCachedQuery(workspace, options.state_root, cacheKeyQuery) as
    | ChunkRecord[]
    | null;
  if (cached) return cached;

  const ranked = rankChunks(
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
  const out = projectChunks(ranked, resolveContentMode(options), options.content_max_chars);
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
  const files = await queryFiles(workspace, query, options.files_limit ?? 16, {
    state_root: options.state_root,
  });
  const symbols = await querySymbols(
    workspace,
    query,
    options.symbols_limit ?? (parsed.intent === "symbols" ? 32 : 16),
    { state_root: options.state_root },
  );
  const chunks = await queryChunks(workspace, query, options.search_limit ?? 8, {
    prefer_code: options.prefer_code,
    path_prefix: options.path_prefix,
    language: options.language,
    intent: parsed.intent,
    content_mode: options.content_mode,
    include_content: options.include_content,
    content_max_chars: options.content_max_chars,
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

  const filesLimit = options.files_limit ?? 6;
  const symbolsLimit = options.symbols_limit ?? (parsed.intent === "symbols" ? 16 : 10);
  const searchLimit = options.search_limit ?? (parsed.intent === "docs" ? 8 : 6);
  const preferCode = options.prefer_code ?? parsed.intent !== "docs";

  let filesParsed = parsed;
  let symbolsParsed = parsed;
  let chunksParsed = parsed;

  let files = await queryFiles(workspace, query, filesLimit, {
    state_root: options.state_root,
  });
  let symbols = await querySymbols(workspace, query, symbolsLimit, {
    state_root: options.state_root,
  });
  let chunks = await queryChunks(workspace, query, searchLimit, {
    prefer_code: preferCode,
    path_prefix: options.path_prefix,
    language: options.language,
    intent: parsed.intent,
    content_mode: "full",
    include_content: true,
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
      content_mode: "full",
      include_content: true,
      state_root: options.state_root,
    });
    if (chunks.length > 0) {
      fallbackStage = fallbackStage === "none" ? "chunks" : "all";
      fallbackDetail = "Primary strategy had no chunk hits, retried with code-focused routing";
    }
  }

  if (files.length === 0) {
    filesParsed = parseQuery(query, "code");
    files = await queryFiles(workspace, query, filesLimit, {
      state_root: options.state_root,
    });
    if (files.length > 0) {
      fallbackStage = fallbackStage === "none" ? "files" : "all";
      fallbackDetail = "Primary strategy had no file hits, retried with broad path routing";
    }
  }

  const compactChunks = projectChunks(
    chunks,
    resolveContentMode(options),
    options.content_max_chars,
  );
  const chunkById = new Map<string, ChunkRecord>();
  for (const chunk of chunks) {
    chunkById.set(chunk.id, chunk);
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
    chunks: rankLookupResults(
      compactChunks,
      (item) => scoreChunk(chunkById.get(item.id) ?? item, chunksParsed),
      {
        label: "fallback-chunk-match",
        detail: "Chunk returned by fallback retrieval path",
      },
    ),
    fallback: {
      used: fallbackStage !== "none",
      stage: fallbackStage,
      detail: fallbackDetail,
    },
  };

  if (options.response_mode === "compact") {
    response.files = toCompactLookupReasons(response.files);
    response.symbols = toCompactLookupReasons(response.symbols);
    response.chunks = toCompactLookupReasons(response.chunks);
  }

  diagnostics.recordQuery(nowMs() - start);
  diagnostics.updateCacheSizes(QUERY_RESULT_CACHE.size, STATUS_CACHE.size);
  return response;
}

export async function queryChunkById(
  workspace: string,
  id: string,
  options: {
    state_root?: string;
    include_content?: boolean;
    content_max_chars?: number;
  } = {},
): Promise<ChunkRecord | null> {
  const chunk = await readChunkById(workspace, id, options.state_root);
  if (!chunk) return null;
  return projectChunk(
    chunk,
    options.include_content === false ? "preview" : "full",
    options.content_max_chars,
  );
}

export const __internal = {
  TopKHeap,
  listFilesFallback,
  parseQuery,
  queryTerms,
  rankFiles,
  rankSymbols,
  rankChunks,
  scoreFile,
  scoreSymbol,
  scoreChunk,
};
