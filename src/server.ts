import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { withAgentGuidanceCompact } from "./agent-guidance";
import { diagnostics } from "./diagnostics";
import { fetchUrl } from "./fetch-url";
import { toToon } from "./format";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
import {
  buildIndex,
  discoverIndex,
  getStatus,
  initWorkspaceIndex,
  lookupIndex,
  queryChunkById,
  queryChunks,
  queryFiles,
  querySymbols,
} from "./indexer";
import { compactStatusSummary } from "./shared/orchestration";
import { diagnosticsStatePath } from "./state-root";
import { TOOL_DESCRIPTIONS } from "./tool-contract";
import { VEIL_VERSION } from "./version";
import { webSearch } from "./web-search";

const LOCAL_READ_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const INDEX_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const EXTERNAL_READ_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const DIAGNOSTICS_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

type QueryInitArgs = {
  workspace?: string;
  state_root?: string;
  refresh_if_stale?: boolean;
};

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>) => unknown;
};

type HttpServerOptions = {
  host?: string;
  port?: number;
  path?: string;
  allow_remote?: boolean;
};

const MAX_HTTP_REQUEST_BODY_BYTES = 1024 * 1024;

class HttpBodyTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpBodyTooLargeError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function successResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: toToon(value) }],
    isError: false,
  };
}

function errorResult(message: string, details?: unknown): CallToolResult {
  const detailsRecord = asRecord(details);
  const errorDetails = asRecord(detailsRecord.error);
  const code = asString(errorDetails.code) ?? "tool-error";
  const payload: Record<string, unknown> = {
    ok: false,
    error: { code, message },
  };
  return {
    content: [{ type: "text", text: toToon(payload) }],
    isError: true,
  };
}

function responseErrorMessage(value: unknown): string | null {
  const payload = asRecord(value);
  const meta = asRecord(payload.meta);
  if (meta.ok === false) {
    const error = asRecord(payload.error);
    const message = asString(error.message);
    return message?.trim() ? message : "Tool execution failed";
  }
  return null;
}

function resolveWorkspace(workspace?: string, stateRoot?: string): string {
  const ws = workspace ?? process.cwd();
  diagnostics.configureStatePath(diagnosticsStatePath(ws, stateRoot));
  return ws;
}

async function initQueryWorkspace(args: QueryInitArgs): Promise<string> {
  const ws = resolveWorkspace(args.workspace, args.state_root);
  await initWorkspaceIndex(ws, {
    state_root: args.state_root,
    refresh_if_stale: args.refresh_if_stale ?? true,
    strict_query_freshness: true,
  });
  return ws;
}

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "veil_status",
    title: "Veil Index Status",
    description: TOOL_DESCRIPTIONS.veil_status,
    inputSchema: {
      workspace: z.string().optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const ws = resolveWorkspace(workspace, stateRoot);
      const status = await getStatus(ws, { state_root: stateRoot });
      return withAgentGuidanceCompact("status", status);
    },
  },
  {
    name: "veil_refresh",
    title: "Veil Refresh Index",
    description: TOOL_DESCRIPTIONS.veil_refresh,
    inputSchema: {
      workspace: z.string().optional(),
      mode: z.enum(["full", "changed"]).optional(),
      state_root: z.string().optional(),
    },
    annotations: INDEX_WRITE_ANNOTATIONS,
    handler: async (args) => {
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const mode = args.mode === "full" ? "full" : "changed";
      const ws = resolveWorkspace(workspace, stateRoot);
      const manifest = await buildIndex(ws, mode, { state_root: stateRoot });
      return withAgentGuidanceCompact("refresh", { ok: true, mode, manifest });
    },
  },
  {
    name: "veil_files",
    title: "Veil Find Files",
    description: TOOL_DESCRIPTIONS.veil_files,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const query = asString(args.query) ?? "";
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const refreshIfStale = asBoolean(args.refresh_if_stale);
      const limit = asNumber(args.limit);
      const ws = await initQueryWorkspace({
        workspace,
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const items = await queryFiles(ws, query, limit ?? 20, { state_root: stateRoot });
      return withAgentGuidanceCompact("files", { items }, { query });
    },
  },
  {
    name: "veil_symbols",
    title: "Veil Find Symbols",
    description: TOOL_DESCRIPTIONS.veil_symbols,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const query = asString(args.query) ?? "";
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const refreshIfStale = asBoolean(args.refresh_if_stale);
      const limit = asNumber(args.limit);
      const ws = await initQueryWorkspace({
        workspace,
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const items = await querySymbols(ws, query, limit ?? 20, { state_root: stateRoot });
      return withAgentGuidanceCompact("symbols", { items }, { query });
    },
  },
  {
    name: "veil_search",
    title: "Veil Search Chunks",
    description: TOOL_DESCRIPTIONS.veil_search,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(100).optional(),
      include_content: z.boolean().optional(),
      content_max_chars: z.number().int().positive().max(20000).optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const query = asString(args.query) ?? "";
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const refreshIfStale = asBoolean(args.refresh_if_stale);
      const ws = await initQueryWorkspace({
        workspace,
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const items = await queryChunks(ws, query, asNumber(args.limit) ?? 10, {
        include_content: asBoolean(args.include_content),
        content_max_chars: asNumber(args.content_max_chars),
        prefer_code: asBoolean(args.prefer_code),
        path_prefix: asString(args.path_prefix),
        language: asString(args.language),
        intent:
          args.intent === "code" || args.intent === "docs" || args.intent === "symbols"
            ? args.intent
            : "auto",
        state_root: stateRoot,
      });
      return withAgentGuidanceCompact("search", { items }, { query });
    },
  },
  {
    name: "veil_lookup",
    title: "Veil Lookup Context",
    description: TOOL_DESCRIPTIONS.veil_lookup,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      files_limit: z.number().int().positive().max(200).optional(),
      symbols_limit: z.number().int().positive().max(200).optional(),
      search_limit: z.number().int().positive().max(100).optional(),
      include_content: z.boolean().optional(),
      content_max_chars: z.number().int().positive().max(20000).optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const query = asString(args.query) ?? "";
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const refreshIfStale = asBoolean(args.refresh_if_stale);
      const ws = await initQueryWorkspace({
        workspace,
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const result = await lookupIndex(ws, query, {
        files_limit: asNumber(args.files_limit),
        symbols_limit: asNumber(args.symbols_limit),
        search_limit: asNumber(args.search_limit),
        include_content: asBoolean(args.include_content),
        content_max_chars: asNumber(args.content_max_chars),
        prefer_code: asBoolean(args.prefer_code),
        path_prefix: asString(args.path_prefix),
        language: asString(args.language),
        intent:
          args.intent === "code" || args.intent === "docs" || args.intent === "symbols"
            ? args.intent
            : "auto",
        state_root: stateRoot,
      });
      return withAgentGuidanceCompact("lookup", result, { query });
    },
  },
  {
    name: "veil_discover",
    title: "Veil Discover Context",
    description: TOOL_DESCRIPTIONS.veil_discover,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      files_limit: z.number().int().positive().max(200).optional(),
      symbols_limit: z.number().int().positive().max(200).optional(),
      search_limit: z.number().int().positive().max(100).optional(),
      include_content: z.boolean().optional(),
      content_max_chars: z.number().int().positive().max(20000).optional(),
      refresh_if_stale: z.boolean().optional(),
      prefer_code: z.boolean().optional(),
      path_prefix: z.string().optional(),
      language: z.string().optional(),
      intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const query = asString(args.query) ?? "";
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const ws = resolveWorkspace(workspace, stateRoot);
      const initResult = await initWorkspaceIndex(ws, {
        state_root: stateRoot,
        refresh_if_stale: asBoolean(args.refresh_if_stale) ?? true,
        strict_query_freshness: true,
      });
      const discovered = await discoverIndex(ws, query, {
        files_limit: asNumber(args.files_limit),
        symbols_limit: asNumber(args.symbols_limit),
        search_limit: asNumber(args.search_limit),
        include_content: asBoolean(args.include_content),
        content_max_chars: asNumber(args.content_max_chars),
        prefer_code: asBoolean(args.prefer_code),
        path_prefix: asString(args.path_prefix),
        language: asString(args.language),
        intent:
          args.intent === "code" || args.intent === "docs" || args.intent === "symbols"
            ? args.intent
            : "auto",
        state_root: stateRoot,
      });
      return withAgentGuidanceCompact(
        "discover",
        {
          status: compactStatusSummary(initResult.status_after),
          intent: discovered.intent,
          files: discovered.files,
          symbols: discovered.symbols,
          chunks: discovered.chunks,
        },
        { query },
      );
    },
  },
  {
    name: "veil_chunk",
    title: "Veil Fetch Chunk",
    description: TOOL_DESCRIPTIONS.veil_chunk,
    inputSchema: {
      workspace: z.string().optional(),
      id: z.string(),
      content_max_chars: z.number().int().positive().max(20000).optional(),
      state_root: z.string().optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const ws = await initQueryWorkspace({
        workspace,
        state_root: stateRoot,
        refresh_if_stale: true,
      });
      const id = asString(args.id) ?? "";
      const item = await queryChunkById(ws, id, {
        state_root: stateRoot,
        include_content: true,
        content_max_chars: asNumber(args.content_max_chars),
      });
      return withAgentGuidanceCompact("chunk", { item }, { query: id });
    },
  },
  {
    name: "veil_web_search",
    title: "Veil Web Search",
    description: TOOL_DESCRIPTIONS.veil_web_search,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(25).optional(),
      timeout_ms: z.number().int().positive().max(15000).optional(),
      debug: z.boolean().optional(),
    },
    annotations: EXTERNAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const query = asString(args.query) ?? "";
      const workspace = asString(args.workspace) ?? process.cwd();
      return withAgentGuidanceCompact(
        "web_search",
        await webSearch(workspace, {
          query,
          limit: asNumber(args.limit),
          timeout_ms: asNumber(args.timeout_ms),
          debug: asBoolean(args.debug),
        }),
        { query },
      );
    },
  },
  {
    name: "veil_fetch_url",
    title: "Veil Fetch URL",
    description: TOOL_DESCRIPTIONS.veil_fetch_url,
    inputSchema: {
      url: z.string(),
      format: z.enum(["markdown", "text", "html"]).optional(),
      timeout_ms: z.number().int().positive().max(20000).optional(),
      max_bytes: z.number().int().positive().max(2000000).optional(),
      allow_private_network: z.boolean().optional(),
    },
    annotations: EXTERNAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const url = asString(args.url) ?? "";
      return withAgentGuidanceCompact(
        "fetch_url",
        await fetchUrl({
          url,
          format:
            args.format === "text" || args.format === "html" || args.format === "markdown"
              ? args.format
              : undefined,
          timeout_ms: asNumber(args.timeout_ms),
          max_bytes: asNumber(args.max_bytes),
          allow_private_network: asBoolean(args.allow_private_network),
        }),
        { query: url },
      );
    },
  },
  {
    name: "veil_git_status",
    title: "Veil Git Status",
    description: TOOL_DESCRIPTIONS.veil_git_status,
    inputSchema: {
      workspace: z.string().optional(),
      timeout_ms: z.number().int().positive().max(10000).optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) =>
      withAgentGuidanceCompact(
        "git_status",
        await gitStatus(asString(args.workspace) ?? process.cwd(), {
          timeout_ms: asNumber(args.timeout_ms),
        }),
      ),
  },
  {
    name: "veil_git_log",
    title: "Veil Git Log",
    description: TOOL_DESCRIPTIONS.veil_git_log,
    inputSchema: {
      workspace: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
      since: z.string().optional(),
      author: z.string().optional(),
      grep: z.string().optional(),
      timeout_ms: z.number().int().positive().max(12000).optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) =>
      withAgentGuidanceCompact(
        "git_log",
        await gitLog(asString(args.workspace) ?? process.cwd(), {
          limit: asNumber(args.limit),
          since: asString(args.since),
          author: asString(args.author),
          grep: asString(args.grep),
          timeout_ms: asNumber(args.timeout_ms),
        }),
      ),
  },
  {
    name: "veil_git_diff",
    title: "Veil Git Diff",
    description: TOOL_DESCRIPTIONS.veil_git_diff,
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
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) =>
      withAgentGuidanceCompact(
        "git_diff",
        await gitDiff(asString(args.workspace) ?? process.cwd(), {
          staged: asBoolean(args.staged),
          path: asString(args.path),
          base: asString(args.base),
          head: asString(args.head),
          name_only: asBoolean(args.name_only),
          timeout_ms: asNumber(args.timeout_ms),
          max_bytes: asNumber(args.max_bytes),
        }),
      ),
  },
  {
    name: "veil_git_show",
    title: "Veil Git Show",
    description: TOOL_DESCRIPTIONS.veil_git_show,
    inputSchema: {
      workspace: z.string().optional(),
      rev: z.string(),
      path: z.string().optional(),
      patch: z.boolean().optional(),
      timeout_ms: z.number().int().positive().max(12000).optional(),
      max_bytes: z.number().int().positive().max(500000).optional(),
    },
    annotations: LOCAL_READ_ANNOTATIONS,
    handler: async (args) =>
      withAgentGuidanceCompact(
        "git_show",
        await gitShow(asString(args.workspace) ?? process.cwd(), {
          rev: asString(args.rev) ?? "",
          path: asString(args.path),
          patch: asBoolean(args.patch),
          timeout_ms: asNumber(args.timeout_ms),
          max_bytes: asNumber(args.max_bytes),
        }),
      ),
  },
  {
    name: "veil_gh_lookup",
    title: "Veil GitHub Lookup",
    description: TOOL_DESCRIPTIONS.veil_gh_lookup,
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
    annotations: EXTERNAL_READ_ANNOTATIONS,
    handler: async (args) => {
      const workspace = asString(args.workspace);
      const stateRoot = asString(args.state_root);
      const ws = resolveWorkspace(workspace, stateRoot);
      const repo = asString(args.repo) ?? "";
      const kind =
        args.kind === "issues" || args.kind === "prs" || args.kind === "checks"
          ? args.kind
          : "repo_context";
      const query = asString(args.query);
      return withAgentGuidanceCompact(
        "gh_lookup",
        await ghLookup(ws, {
          repo,
          kind,
          query,
          limit: asNumber(args.limit),
          timeout_ms: asNumber(args.timeout_ms),
          temp_root: asString(args.temp_root),
          state_root: stateRoot,
        }),
        { query: query ?? repo },
      );
    },
  },
  {
    name: "veil_diagnostics",
    title: "Veil Diagnostics",
    description: TOOL_DESCRIPTIONS.veil_diagnostics,
    inputSchema: {
      reset: z.boolean().optional(),
    },
    annotations: DIAGNOSTICS_ANNOTATIONS,
    handler: (args) => {
      const data = diagnostics.getDiagnostics();
      if (asBoolean(args.reset)) {
        diagnostics.reset();
      }
      return withAgentGuidanceCompact("diagnostics", data);
    },
  },
];

async function executeTool(
  definition: ToolDefinition,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    const value = await definition.handler(args);
    const errorMessage = responseErrorMessage(value);
    if (errorMessage) {
      return errorResult(errorMessage, value);
    }
    return successResult(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(message);
  }
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "veil-mcp-server",
    version: VEIL_VERSION,
  });

  for (const definition of TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: definition.annotations,
      },
      async (args) => executeTool(definition, args as Record<string, unknown>),
    );
  }

  return server;
}

function normalizeHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function hostNameFromHeader(value: string | undefined): string {
  const host = value?.trim() ?? "";
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end !== -1) {
      return normalizeHost(host.slice(0, end + 1));
    }
    return normalizeHost(host);
  }
  const first = host.split(":")[0] ?? "";
  return normalizeHost(first);
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function originHost(origin: string | undefined): string {
  if (!origin) return "";
  try {
    return normalizeHost(new URL(origin).hostname);
  } catch {
    return "";
  }
}

function validateHttpRequest(
  req: IncomingMessage,
  listenHost: string,
  allowRemote: boolean,
): string | null {
  if (allowRemote) return null;

  const requestHost = hostNameFromHeader(req.headers.host);
  if (!requestHost || !isLoopbackHost(requestHost)) {
    return "Request host is not allowed for local-only mode";
  }

  const parsedOriginHost = originHost(asString(req.headers.origin));
  if (parsedOriginHost && !isLoopbackHost(parsedOriginHost)) {
    return "Origin is not allowed for local-only mode";
  }

  if (!isLoopbackHost(normalizeHost(listenHost))) {
    return "Server host must be loopback unless allow_remote is true";
  }

  return null;
}

async function parseRequestBody(
  req: IncomingMessage,
  maxBytes = MAX_HTTP_REQUEST_BODY_BYTES,
): Promise<unknown> {
  if (req.method !== "POST") return undefined;
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        throw new HttpBodyTooLargeError(`Request body exceeds ${String(maxBytes)} bytes maximum`);
      }
      chunks.push(buffer);
      continue;
    }
    if (Buffer.isBuffer(chunk)) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        throw new HttpBodyTooLargeError(`Request body exceeds ${String(maxBytes)} bytes maximum`);
      }
      chunks.push(chunk);
      continue;
    }
    if (chunk instanceof Uint8Array) {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        throw new HttpBodyTooLargeError(`Request body exceeds ${String(maxBytes)} bytes maximum`);
      }
      chunks.push(buffer);
      continue;
    }
    const buffer = Buffer.from(String(chunk));
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new HttpBodyTooLargeError(`Request body exceeds ${String(maxBytes)} bytes maximum`);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

let started = false;
let startServerPromise: Promise<void> | null = null;

export async function startServer(): Promise<void> {
  if (started) return;
  startServerPromise ??= (async () => {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    started = true;
  })().catch((error: unknown) => {
    startServerPromise = null;
    throw error;
  });
  await startServerPromise;
}

let httpServerStarted = false;
let startHttpServerPromise: Promise<void> | null = null;

export async function startHttpServer(options: HttpServerOptions = {}): Promise<void> {
  if (httpServerStarted) return;
  if (startHttpServerPromise) {
    await startHttpServerPromise;
    return;
  }

  const host = options.host?.trim() ?? "127.0.0.1";
  const port = Number.isFinite(options.port) ? Number(options.port) : 8765;
  const path = options.path?.trim() ?? "/mcp";
  const allowRemote = options.allow_remote === true;
  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await mcpServer.connect(transport);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if ((req.url ?? "") !== path) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }

      if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }

      const requestValidationError = validateHttpRequest(req, host, allowRemote);
      if (requestValidationError) {
        res.statusCode = 403;
        res.end(requestValidationError);
        return;
      }

      const parsedBody = await parseRequestBody(req);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      if (error instanceof HttpBodyTooLargeError) {
        if (!res.headersSent) {
          res.statusCode = 413;
          res.end(error.message);
        }
        return;
      }
      if (!res.headersSent) {
        res.statusCode = 500;
        const message = error instanceof Error ? error.message : String(error);
        res.end(message);
      }
    }
  });

  startHttpServerPromise = new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      httpServerStarted = true;
      resolve();
    });
  });

  try {
    await startHttpServerPromise;
  } catch (error) {
    startHttpServerPromise = null;
    await transport.close();
    await mcpServer.close();
    throw error;
  }
}

export const __internalServer = {
  createMcpServer,
  toolNames: TOOL_DEFINITIONS.map((definition) => definition.name),
  toolDefinitions: TOOL_DEFINITIONS,
  responseErrorMessage,
  parseRequestBody,
  maxHttpRequestBodyBytes: MAX_HTTP_REQUEST_BODY_BYTES,
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
