import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { diagnostics } from "./diagnostics";
import { fetchUrl } from "./fetch-url";
import { toToon } from "./format";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
import {
  discoverIndex,
  getStatus,
  initWorkspaceIndex,
  lookupIndex,
  queryChunks,
  queryFiles,
  querySymbols,
  buildIndex,
} from "./indexer";
import { diagnosticsStatePath } from "./state-root";
import { VEIL_VERSION } from "./version";
import { webSearch } from "./web-search";

function asText(data: unknown): {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
} {
  const structuredContent =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { value: data };
  return {
    content: [{ type: "text", text: toToon(data) }],
    structuredContent,
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INIT_TIMEOUT_MS = 4_000;
const DEFAULT_BACKGROUND_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BACKGROUND_MAX_REFRESHES_PER_HOUR = 4;

type StartupInitSnapshot = {
  workspace: string;
  reason: string;
  refreshed: boolean;
  ok: boolean;
  started_at: string;
  finished_at: string;
  error: string | null;
};

type ServerRuntimeState = {
  init_runs: number;
  init_failures: number;
  init_inflight: boolean;
  init_last: StartupInitSnapshot | null;
  background_enabled: boolean;
  background_interval_ms: number;
  background_max_refreshes_per_hour: number;
  background_window_started_ms: number;
  background_refreshes_in_window: number;
};

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function shouldRefreshForQuery(requested: boolean | undefined, envEnabled: boolean): boolean {
  return requested ?? envEnabled;
}

function canRunBackgroundRefresh(now: number, runtime: ServerRuntimeState): boolean {
  if (now - runtime.background_window_started_ms >= HOUR_MS) {
    runtime.background_window_started_ms = now;
    runtime.background_refreshes_in_window = 0;
  }
  return runtime.background_refreshes_in_window < runtime.background_max_refreshes_per_hour;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`init-timeout-${String(timeoutMs)}ms`));
    }, timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

const DEFAULT_QUERY_AUTO_REFRESH = parseBooleanFlag(
  process.env.VEIL_SERVER_AUTO_REFRESH_ON_QUERY,
  true,
);

const runtime: ServerRuntimeState = {
  init_runs: 0,
  init_failures: 0,
  init_inflight: false,
  init_last: null,
  background_enabled: parseBooleanFlag(process.env.VEIL_SERVER_BACKGROUND_REFRESH, false),
  background_interval_ms: parseBoundedInt(
    process.env.VEIL_SERVER_BACKGROUND_REFRESH_INTERVAL_MS,
    DEFAULT_BACKGROUND_INTERVAL_MS,
    10_000,
    HOUR_MS,
  ),
  background_max_refreshes_per_hour: parseBoundedInt(
    process.env.VEIL_SERVER_BACKGROUND_MAX_PER_HOUR,
    DEFAULT_BACKGROUND_MAX_REFRESHES_PER_HOUR,
    1,
    120,
  ),
  background_window_started_ms: Date.now(),
  background_refreshes_in_window: 0,
};

async function runWorkspaceInit(
  workspace: string,
  stateRoot: string | undefined,
  reason: string,
  refresh_if_stale: boolean,
): Promise<void> {
  if (runtime.init_inflight) return;
  runtime.init_inflight = true;
  runtime.init_runs += 1;
  const startedAt = new Date().toISOString();

  try {
    diagnostics.configureStatePath(diagnosticsStatePath(workspace, stateRoot));
    const timeoutMs = parseBoundedInt(
      process.env.VEIL_SERVER_INIT_TIMEOUT_MS,
      DEFAULT_INIT_TIMEOUT_MS,
      200,
      60_000,
    );
    const result = await withTimeout(
      initWorkspaceIndex(workspace, { state_root: stateRoot, refresh_if_stale }),
      timeoutMs,
    );
    if (reason === "background" && result.refreshed) {
      runtime.background_refreshes_in_window += 1;
    }
    runtime.init_last = {
      workspace,
      reason,
      refreshed: result.refreshed,
      ok: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error: null,
    };
  } catch (error: unknown) {
    runtime.init_failures += 1;
    runtime.init_last = {
      workspace,
      reason,
      refreshed: false,
      ok: false,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    runtime.init_inflight = false;
  }
}

function startBackgroundMaintenance(workspace: string, stateRoot: string | undefined): void {
  if (!runtime.background_enabled) return;

  const timer = setInterval(() => {
    const now = Date.now();
    if (!canRunBackgroundRefresh(now, runtime)) return;
    void runWorkspaceInit(workspace, stateRoot, "background", true);
  }, runtime.background_interval_ms);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

const server = new McpServer({
  name: "veil",
  version: VEIL_VERSION,
});

server.registerTool(
  "status",
  {
    description: "Return current index status and staleness reasons",
    inputSchema: {
      workspace: z.string().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, state_root }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    const status = await getStatus(ws, { state_root });
    return asText(status);
  },
);

server.registerTool(
  "refresh",
  {
    description: "Build or refresh the index in .veil/index",
    inputSchema: {
      workspace: z.string().optional(),
      mode: z.enum(["full", "changed"]).optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, mode, state_root }) => {
    const ws = workspace ?? process.cwd();
    const selectedMode = mode ?? "changed";
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    const manifest = await buildIndex(ws, selectedMode, { state_root });
    return asText({ ok: true, mode: selectedMode, manifest });
  },
);

server.registerTool(
  "files",
  {
    description: "Find files by substring path query",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const items = await queryFiles(ws, query, limit ?? 20, { state_root });
    return asText({ items });
  },
);

server.registerTool(
  "symbols",
  {
    description: "Find symbols by name",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const items = await querySymbols(ws, query, limit ?? 20, { state_root });
    return asText({ items });
  },
);

server.registerTool(
  "search",
  {
    description: "Search indexed code chunks by keyword",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(100).optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({
    workspace,
    query,
    limit,
    prefer_code,
    path_prefix,
    language,
    intent,
    refresh_if_stale,
    state_root,
  }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const items = await queryChunks(ws, query, limit ?? 10, {
      prefer_code,
      path_prefix,
      language,
      intent,
      state_root,
    });
    return asText({ items });
  },
);

server.registerTool(
  "find_file",
  {
    description: "Compatibility alias for file lookup by path query",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const items = await queryFiles(ws, query, limit ?? 20, { state_root });
    return asText({ items });
  },
);

server.registerTool(
  "find_symbol",
  {
    description: "Compatibility alias for symbol lookup by name",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const items = await querySymbols(ws, query, limit ?? 20, { state_root });
    return asText({ items });
  },
);

server.registerTool(
  "search_for_pattern",
  {
    description: "Compatibility alias for indexed code/content search",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(100).optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({
    workspace,
    query,
    limit,
    prefer_code,
    path_prefix,
    language,
    intent,
    refresh_if_stale,
    state_root,
  }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const items = await queryChunks(ws, query, limit ?? 10, {
      prefer_code,
      path_prefix,
      language,
      intent,
      state_root,
    });
    return asText({ items });
  },
);

server.registerTool(
  "lookup",
  {
    description: "Intent-aware contextual lookup with explainable ranking and fallback metadata",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      files_limit: z.number().int().positive().max(200).optional(),
      symbols_limit: z.number().int().positive().max(200).optional(),
      search_limit: z.number().int().positive().max(100).optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({
    workspace,
    query,
    files_limit,
    symbols_limit,
    search_limit,
    prefer_code,
    path_prefix,
    language,
    intent,
    refresh_if_stale,
    state_root,
  }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: shouldRefreshForQuery(refresh_if_stale, DEFAULT_QUERY_AUTO_REFRESH),
    });
    const result = await lookupIndex(ws, query, {
      files_limit,
      symbols_limit,
      search_limit,
      prefer_code,
      path_prefix,
      language,
      intent,
      state_root,
    });
    return asText(result);
  },
);

server.registerTool(
  "discover",
  {
    description: "Status check plus focused files/symbols/search in one call",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      files_limit: z.number().int().positive().max(200).optional(),
      symbols_limit: z.number().int().positive().max(200).optional(),
      search_limit: z.number().int().positive().max(100).optional(),
      refresh_if_stale: z.boolean().optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      state_root: z.string().optional(),
    },
  },
  async ({
    workspace,
    query,
    files_limit,
    symbols_limit,
    search_limit,
    refresh_if_stale,
    prefer_code,
    path_prefix,
    language,
    intent,
    state_root,
  }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    const initResult = await initWorkspaceIndex(ws, {
      state_root,
      refresh_if_stale: refresh_if_stale ?? true,
    });

    const discovered = await discoverIndex(ws, query, {
      files_limit,
      symbols_limit,
      search_limit,
      prefer_code,
      path_prefix,
      language,
      intent,
      state_root,
    });

    return asText({
      status: initResult.status_after,
      intent: discovered.intent,
      files: discovered.files,
      symbols: discovered.symbols,
      chunks: discovered.chunks,
    });
  },
);

server.registerTool(
  "web_search",
  {
    description:
      "Fast web search across google, duckduckgo, wikipedia, github, reddit, and deepwiki",
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(25).optional(),
      timeout_ms: z.number().int().positive().max(15000).optional(),
      debug: z.boolean().optional(),
    },
  },
  async ({ workspace, query, limit, timeout_ms, debug }) => {
    const ws = workspace ?? process.cwd();
    return asText(await webSearch(ws, { query, limit, timeout_ms, debug }));
  },
);

server.registerTool(
  "fetch_url",
  {
    description: "Fetch URL content with markdown-first negotiation",
    inputSchema: {
      url: z.string(),
      format: z.enum(["markdown", "text", "html"]).optional(),
      timeout_ms: z.number().int().positive().max(20000).optional(),
      max_bytes: z.number().int().positive().max(2000000).optional(),
    },
  },
  async ({ url, format, timeout_ms, max_bytes }) => {
    return asText(await fetchUrl({ url, format, timeout_ms, max_bytes }));
  },
);

server.registerTool(
  "git_status",
  {
    description: "Inspect git branch and dirty workspace state",
    inputSchema: {
      workspace: z.string().optional(),
      timeout_ms: z.number().int().positive().max(10000).optional(),
    },
  },
  ({ workspace, timeout_ms }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitStatus(ws, { timeout_ms }));
  },
);

server.registerTool(
  "git_log",
  {
    description: "Look up git commit log entries with filters",
    inputSchema: {
      workspace: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
      since: z.string().optional(),
      author: z.string().optional(),
      grep: z.string().optional(),
      timeout_ms: z.number().int().positive().max(12000).optional(),
    },
  },
  ({ workspace, limit, since, author, grep, timeout_ms }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitLog(ws, { limit, since, author, grep, timeout_ms }));
  },
);

server.registerTool(
  "git_diff",
  {
    description: "Look up uncommitted or ranged git diff output",
    inputSchema: {
      workspace: z.string().optional(),
      staged: z.boolean().optional(),
      path: z.string().optional(),
      base: z.string().optional(),
      head: z.string().optional(),
      name_only: z.boolean().optional(),
      timeout_ms: z.number().int().positive().max(10000).optional(),
      max_bytes: z.number().int().positive().max(500000).optional(),
    },
  },
  ({ workspace, staged, path, base, head, name_only, timeout_ms, max_bytes }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitDiff(ws, { staged, path, base, head, name_only, timeout_ms, max_bytes }));
  },
);

server.registerTool(
  "git_show",
  {
    description: "Look up details for a specific commit",
    inputSchema: {
      workspace: z.string().optional(),
      rev: z.string(),
      path: z.string().optional(),
      patch: z.boolean().optional(),
      timeout_ms: z.number().int().positive().max(12000).optional(),
      max_bytes: z.number().int().positive().max(500000).optional(),
    },
  },
  ({ workspace, rev, path, patch, timeout_ms, max_bytes }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitShow(ws, { rev, path, patch, timeout_ms, max_bytes }));
  },
);

server.registerTool(
  "gh_lookup",
  {
    description: "Optionally look up GitHub issues, PRs, or checks via gh CLI",
    inputSchema: {
      workspace: z.string().optional(),
      repo: z.string(),
      kind: z.enum(["repo_context", "issues", "prs", "checks"]),
      query: z.string().optional(),
      limit: z.number().int().positive().max(50).optional(),
      timeout_ms: z.number().int().positive().max(20000).optional(),
      temp_root: z.string().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, repo, kind, query, limit, timeout_ms, temp_root, state_root }) => {
    const ws = workspace ?? process.cwd();
    diagnostics.configureStatePath(diagnosticsStatePath(ws, state_root));
    return asText(
      await ghLookup(ws, { repo, kind, query, limit, timeout_ms, temp_root, state_root }),
    );
  },
);

server.registerTool(
  "diagnostics",
  {
    description:
      "Get performance diagnostics including cache stats, latency histograms, and memory usage",
    inputSchema: {
      reset: z.boolean().optional(),
    },
  },
  ({ reset }) => {
    const data = diagnostics.getDiagnostics();
    if (reset) {
      diagnostics.reset();
    }
    return asText({
      ...data,
      server_runtime: {
        init_runs: runtime.init_runs,
        init_failures: runtime.init_failures,
        init_inflight: runtime.init_inflight,
        init_last: runtime.init_last,
        background_enabled: runtime.background_enabled,
        background_interval_ms: runtime.background_interval_ms,
        background_max_refreshes_per_hour: runtime.background_max_refreshes_per_hour,
        background_window_started_ms: runtime.background_window_started_ms,
        background_refreshes_in_window: runtime.background_refreshes_in_window,
      },
    });
  },
);

let started = false;

export async function startServer(): Promise<void> {
  if (started) return;
  started = true;

  const workspace = process.cwd();
  const stateRoot = process.env.VEIL_STATE_ROOT;
  const autoInitEnabled = parseBooleanFlag(process.env.VEIL_SERVER_AUTO_INIT, true);
  if (autoInitEnabled) {
    void runWorkspaceInit(workspace, stateRoot, "startup", true);
  }
  startBackgroundMaintenance(workspace, stateRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export const __internalServer = {
  parseBooleanFlag,
  parseBoundedInt,
  shouldRefreshForQuery,
  canRunBackgroundRefresh,
};

const meta = import.meta as unknown as Record<string, unknown>;
const sourceSuffix = `${sep}src${sep}server.ts`;
const isSourceModule = fileURLToPath(import.meta.url).endsWith(sourceSuffix);
const argvRefsSource = process.argv.some(
  (arg) => arg.endsWith(`${sep}src${sep}server.ts`) || arg === "src/server.ts",
);
if (isSourceModule && (meta.main === true || argvRefsSource)) {
  await startServer();
}
