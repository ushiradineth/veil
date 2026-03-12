import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { withAgentGuidance } from "./agent-guidance";
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
  queryChunks,
  queryFiles,
  querySymbols,
} from "./indexer";
import { diagnosticsStatePath } from "./state-root";
import { TOOL_DESCRIPTIONS } from "./tool-contract";
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

type QueryInitArgs = {
  workspace?: string;
  state_root?: string;
  refresh_if_stale?: boolean;
};

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
  });
  return ws;
}

const server = new McpServer({
  name: "veil",
  version: VEIL_VERSION,
});

server.registerTool(
  "status",
  {
    description: TOOL_DESCRIPTIONS.status,
    inputSchema: {
      workspace: z.string().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, state_root }) => {
    const ws = resolveWorkspace(workspace, state_root);
    const status = await getStatus(ws, { state_root });
    return asText(withAgentGuidance("status", status));
  },
);

server.registerTool(
  "refresh",
  {
    description: TOOL_DESCRIPTIONS.refresh,
    inputSchema: {
      workspace: z.string().optional(),
      mode: z.enum(["full", "changed"]).optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, mode, state_root }) => {
    const ws = resolveWorkspace(workspace, state_root);
    const selectedMode = mode ?? "changed";
    const manifest = await buildIndex(ws, selectedMode, { state_root });
    return asText(withAgentGuidance("refresh", { ok: true, mode: selectedMode, manifest }));
  },
);

server.registerTool(
  "files",
  {
    description: TOOL_DESCRIPTIONS.files,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
    const items = await queryFiles(ws, query, limit ?? 20, { state_root });
    return asText(withAgentGuidance("files", { items }, { query }));
  },
);

server.registerTool(
  "symbols",
  {
    description: TOOL_DESCRIPTIONS.symbols,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
    const items = await querySymbols(ws, query, limit ?? 20, { state_root });
    return asText(withAgentGuidance("symbols", { items }, { query }));
  },
);

server.registerTool(
  "search",
  {
    description: TOOL_DESCRIPTIONS.search,
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
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
    const items = await queryChunks(ws, query, limit ?? 10, {
      prefer_code,
      path_prefix,
      language,
      intent,
      state_root,
    });
    return asText(withAgentGuidance("search", { items }, { query }));
  },
);

server.registerTool(
  "find_file",
  {
    description: TOOL_DESCRIPTIONS.find_file,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
    const items = await queryFiles(ws, query, limit ?? 20, { state_root });
    return asText(withAgentGuidance("find_file", { items }, { query }));
  },
);

server.registerTool(
  "find_symbol",
  {
    description: TOOL_DESCRIPTIONS.find_symbol,
    inputSchema: {
      workspace: z.string().optional(),
      query: z.string(),
      limit: z.number().int().positive().max(200).optional(),
      refresh_if_stale: z.boolean().optional(),
      state_root: z.string().optional(),
    },
  },
  async ({ workspace, query, limit, refresh_if_stale, state_root }) => {
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
    const items = await querySymbols(ws, query, limit ?? 20, { state_root });
    return asText(withAgentGuidance("find_symbol", { items }, { query }));
  },
);

server.registerTool(
  "search_for_pattern",
  {
    description: TOOL_DESCRIPTIONS.search_for_pattern,
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
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
    const items = await queryChunks(ws, query, limit ?? 10, {
      prefer_code,
      path_prefix,
      language,
      intent,
      state_root,
    });
    return asText(withAgentGuidance("search_for_pattern", { items }, { query }));
  },
);

server.registerTool(
  "lookup",
  {
    description: TOOL_DESCRIPTIONS.lookup,
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
    const ws = await initQueryWorkspace({ workspace, state_root, refresh_if_stale });
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
    return asText(withAgentGuidance("lookup", result, { query }));
  },
);

server.registerTool(
  "discover",
  {
    description: TOOL_DESCRIPTIONS.discover,
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
    const ws = resolveWorkspace(workspace, state_root);
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

    return asText(
      withAgentGuidance(
        "discover",
        {
          status: initResult.status_after,
          intent: discovered.intent,
          files: discovered.files,
          symbols: discovered.symbols,
          chunks: discovered.chunks,
        },
        { query },
      ),
    );
  },
);

server.registerTool(
  "web_search",
  {
    description: TOOL_DESCRIPTIONS.web_search,
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
    return asText(
      withAgentGuidance("web_search", await webSearch(ws, { query, limit, timeout_ms, debug }), {
        query,
      }),
    );
  },
);

server.registerTool(
  "fetch_url",
  {
    description: TOOL_DESCRIPTIONS.fetch_url,
    inputSchema: {
      url: z.string(),
      format: z.enum(["markdown", "text", "html"]).optional(),
      timeout_ms: z.number().int().positive().max(20000).optional(),
      max_bytes: z.number().int().positive().max(2000000).optional(),
    },
  },
  async ({ url, format, timeout_ms, max_bytes }) => {
    return asText(
      withAgentGuidance("fetch_url", await fetchUrl({ url, format, timeout_ms, max_bytes }), {
        query: url,
      }),
    );
  },
);

server.registerTool(
  "git_status",
  {
    description: TOOL_DESCRIPTIONS.git_status,
    inputSchema: {
      workspace: z.string().optional(),
      timeout_ms: z.number().int().positive().max(10000).optional(),
    },
  },
  ({ workspace, timeout_ms }) => {
    const ws = workspace ?? process.cwd();
    return asText(withAgentGuidance("git_status", gitStatus(ws, { timeout_ms })));
  },
);

server.registerTool(
  "git_log",
  {
    description: TOOL_DESCRIPTIONS.git_log,
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
    return asText(
      withAgentGuidance("git_log", gitLog(ws, { limit, since, author, grep, timeout_ms })),
    );
  },
);

server.registerTool(
  "git_diff",
  {
    description: TOOL_DESCRIPTIONS.git_diff,
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
    return asText(
      withAgentGuidance(
        "git_diff",
        gitDiff(ws, { staged, path, base, head, name_only, timeout_ms, max_bytes }),
      ),
    );
  },
);

server.registerTool(
  "git_show",
  {
    description: TOOL_DESCRIPTIONS.git_show,
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
    return asText(
      withAgentGuidance("git_show", gitShow(ws, { rev, path, patch, timeout_ms, max_bytes })),
    );
  },
);

server.registerTool(
  "gh_lookup",
  {
    description: TOOL_DESCRIPTIONS.gh_lookup,
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
    const ws = resolveWorkspace(workspace, state_root);
    return asText(
      withAgentGuidance(
        "gh_lookup",
        await ghLookup(ws, { repo, kind, query, limit, timeout_ms, temp_root, state_root }),
        { query: query ?? repo },
      ),
    );
  },
);

server.registerTool(
  "diagnostics",
  {
    description: TOOL_DESCRIPTIONS.diagnostics,
    inputSchema: {
      reset: z.boolean().optional(),
    },
  },
  ({ reset }) => {
    const data = diagnostics.getDiagnostics();
    if (reset) {
      diagnostics.reset();
    }
    return asText(withAgentGuidance("diagnostics", data));
  },
);

let started = false;

export async function startServer(): Promise<void> {
  if (started) return;
  started = true;
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const meta = import.meta as unknown as Record<string, unknown>;
const sourceSuffix = `${sep}src${sep}server.ts`;
const isSourceModule = fileURLToPath(import.meta.url).endsWith(sourceSuffix);
const argvRefsSource = process.argv.some(
  (arg) => arg.endsWith(`${sep}src${sep}server.ts`) || arg === "src/server.ts",
);
if (isSourceModule && (meta.main === true || argvRefsSource)) {
  await startServer();
}
