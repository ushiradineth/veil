import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildIndex, discoverIndex, getStatus, lookupIndex, queryChunks, queryFiles, querySymbols, shouldRefreshDiscover } from "./indexer";
import { diagnostics } from "./diagnostics";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";

function asText(data: unknown): { content: { type: "text"; text: string }[]; structuredContent: Record<string, unknown> } {
  const structuredContent =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { value: data };
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent,
  };
}

const server = new McpServer({
  name: "veil",
  version: "0.1.0",
});

server.tool(
  "status",
  "Return current index status and staleness reasons",
  {
    workspace: z.string().optional(),
  },
  async ({ workspace }) => {
    const ws = workspace ?? process.cwd();
    const status = await getStatus(ws);
    return asText(status);
  },
);

server.tool(
  "refresh",
  "Build or refresh the index in .agents/index",
  {
    workspace: z.string().optional(),
    mode: z.enum(["full", "changed"]).optional(),
  },
  async ({ workspace, mode }) => {
    const ws = workspace ?? process.cwd();
    const selectedMode = mode ?? "changed";
    const manifest = await buildIndex(ws, selectedMode);
    return asText({ ok: true, mode: selectedMode, manifest });
  },
);

server.tool(
  "files",
  "Find files by substring path query",
  {
    workspace: z.string().optional(),
    query: z.string(),
    limit: z.number().int().positive().max(200).optional(),
  },
  async ({ workspace, query, limit }) => {
    const ws = workspace ?? process.cwd();
    const items = await queryFiles(ws, query, limit ?? 20);
    return asText({ items });
  },
);

server.tool(
  "symbols",
  "Find symbols by name",
  {
    workspace: z.string().optional(),
    query: z.string(),
    limit: z.number().int().positive().max(200).optional(),
  },
  async ({ workspace, query, limit }) => {
    const ws = workspace ?? process.cwd();
    const items = await querySymbols(ws, query, limit ?? 20);
    return asText({ items });
  },
);

server.tool(
  "search",
  "Search indexed code chunks by keyword",
  {
    workspace: z.string().optional(),
    query: z.string(),
    limit: z.number().int().positive().max(100).optional(),
    prefer_code: z.boolean().optional(),
    path_prefix: z.string().optional(),
    language: z.string().optional(),
    intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
  },
  async ({ workspace, query, limit, prefer_code, path_prefix, language, intent }) => {
    const ws = workspace ?? process.cwd();
    const items = await queryChunks(ws, query, limit ?? 10, {
      prefer_code,
      path_prefix,
      language,
      intent,
    });
    return asText({ items });
  },
);

server.tool(
  "lookup",
  "Intent-aware contextual lookup with explainable ranking and fallback metadata",
  {
    workspace: z.string().optional(),
    query: z.string(),
    files_limit: z.number().int().positive().max(200).optional(),
    symbols_limit: z.number().int().positive().max(200).optional(),
    search_limit: z.number().int().positive().max(100).optional(),
    prefer_code: z.boolean().optional(),
    path_prefix: z.string().optional(),
    language: z.string().optional(),
    intent: z.enum(["auto", "code", "docs", "symbols"]).optional(),
  },
  async ({ workspace, query, files_limit, symbols_limit, search_limit, prefer_code, path_prefix, language, intent }) => {
    const ws = workspace ?? process.cwd();
    const result = await lookupIndex(ws, query, {
      files_limit,
      symbols_limit,
      search_limit,
      prefer_code,
      path_prefix,
      language,
      intent,
    });
    return asText(result);
  },
);

server.tool(
  "discover",
  "Status check plus focused files/symbols/search in one call",
  {
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
  }) => {
    const ws = workspace ?? process.cwd();
    let status = await getStatus(ws);
    if (shouldRefreshDiscover(status) && (refresh_if_stale ?? true)) {
      await buildIndex(ws, "changed");
      status = await getStatus(ws);
    }

    const discovered = await discoverIndex(ws, query, {
      files_limit,
      symbols_limit,
      search_limit,
      prefer_code,
      path_prefix,
      language,
      intent,
    });

    return asText({ status, intent: discovered.intent, files: discovered.files, symbols: discovered.symbols, chunks: discovered.chunks });
  },
);

server.tool(
  "git_status",
  "Inspect git branch and dirty workspace state",
  {
    workspace: z.string().optional(),
    timeout_ms: z.number().int().positive().max(10000).optional(),
  },
  async ({ workspace, timeout_ms }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitStatus(ws, { timeout_ms }));
  },
);

server.tool(
  "git_log",
  "Look up git commit log entries with filters",
  {
    workspace: z.string().optional(),
    limit: z.number().int().positive().max(200).optional(),
    since: z.string().optional(),
    author: z.string().optional(),
    grep: z.string().optional(),
    timeout_ms: z.number().int().positive().max(12000).optional(),
  },
  async ({ workspace, limit, since, author, grep, timeout_ms }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitLog(ws, { limit, since, author, grep, timeout_ms }));
  },
);

server.tool(
  "git_diff",
  "Look up uncommitted or ranged git diff output",
  {
    workspace: z.string().optional(),
    staged: z.boolean().optional(),
    path: z.string().optional(),
    base: z.string().optional(),
    head: z.string().optional(),
    name_only: z.boolean().optional(),
    timeout_ms: z.number().int().positive().max(10000).optional(),
    max_bytes: z.number().int().positive().max(500000).optional(),
  },
  async ({ workspace, staged, path, base, head, name_only, timeout_ms, max_bytes }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitDiff(ws, { staged, path, base, head, name_only, timeout_ms, max_bytes }));
  },
);

server.tool(
  "git_show",
  "Look up details for a specific commit",
  {
    workspace: z.string().optional(),
    rev: z.string(),
    path: z.string().optional(),
    patch: z.boolean().optional(),
    timeout_ms: z.number().int().positive().max(12000).optional(),
    max_bytes: z.number().int().positive().max(500000).optional(),
  },
  async ({ workspace, rev, path, patch, timeout_ms, max_bytes }) => {
    const ws = workspace ?? process.cwd();
    return asText(gitShow(ws, { rev, path, patch, timeout_ms, max_bytes }));
  },
);

server.tool(
  "gh_lookup",
  "Optionally look up GitHub issues, PRs, or checks via gh CLI",
  {
    workspace: z.string().optional(),
    repo: z.string(),
    kind: z.enum(["issues", "prs", "checks"]),
    query: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
    timeout_ms: z.number().int().positive().max(20000).optional(),
  },
  async ({ workspace, repo, kind, query, limit, timeout_ms }) => {
    const ws = workspace ?? process.cwd();
    return asText(ghLookup(ws, { repo, kind, query, limit, timeout_ms }));
  },
);

server.tool(
  "diagnostics",
  "Get performance diagnostics including cache stats, latency histograms, and memory usage",
  {
    reset: z.boolean().optional(),
  },
  async ({ reset }) => {
    const data = diagnostics.getDiagnostics();
    if (reset) {
      diagnostics.reset();
    }
    return asText(data);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
