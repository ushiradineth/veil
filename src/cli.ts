import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import { withAgentGuidance } from "./agent-guidance";
import { CLI_COMMAND_REGISTRY } from "./cli-contract";
import { profiler, diagnostics } from "./diagnostics";
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
import type { BuildMode } from "./types";
import { webSearch } from "./web-search";

function getArg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function isHelpToken(value: string | undefined): boolean {
  if (!value) return false;
  return value === "help" || value === "--help" || value === "-h";
}

function commandHelpLines(): string[] {
  return CLI_COMMAND_REGISTRY.map((entry) => {
    return "  " + entry.name.padEnd(36) + " " + entry.description;
  });
}

function defaultExamples(): string[] {
  const selected = ["status", "init", "discover", "lookup", "files", "symbols", "search"] as const;
  const byName = new Map(CLI_COMMAND_REGISTRY.map((entry) => [entry.name, entry]));
  const examples: string[] = [];
  for (const name of selected) {
    const entry = byName.get(name);
    const sample = entry?.examples[0];
    if (sample) {
      examples.push("  " + sample);
    }
  }
  examples.push('  veil web-search --query "typescript language server" --limit 5');
  examples.push("  veil fetch-url --url https://www.iana.org/domains/reserved --format markdown");
  examples.push("  veil gh-lookup --repo ushiradineth/veil --kind repo_context");
  examples.push("  veil mcp server");
  return examples;
}

function cliHelp(): string {
  return [
    "Veil CLI",
    "",
    "Usage:",
    "  veil <command> [options]",
    "",
    "Commands:",
    ...commandHelpLines(),
    "",
    "Global options:",
    "  --workspace <path>                    Workspace root (default: cwd)",
    "  --state-root <path>                   Override .veil state root",
    "  --profile                             Enable profiling report",
    "",
    "Examples:",
    ...defaultExamples(),
  ].join("\n");
}

function commandHelp(cmd: string): string {
  const spec = CLI_COMMAND_REGISTRY.find((entry) => entry.name === cmd);
  if (!spec) {
    return cliHelp();
  }
  return [
    "Veil CLI",
    "",
    "Command:",
    `  ${spec.name}`,
    "",
    "Description:",
    `  ${spec.description}`,
    "",
    "Usage:",
    `  ${spec.usage}`,
    "",
    "Examples:",
    ...spec.examples.map((example) => `  ${example}`),
  ].join("\n");
}

function resolveWorkspace(): string {
  return getArg("--workspace") ?? process.cwd();
}

function writeOutput(data: unknown): void {
  process.stdout.write(toToon(data) + "\n");
}

export async function runCli(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd || isHelpToken(cmd)) {
    process.stdout.write(cliHelp() + "\n");
    return;
  }

  if (hasFlag("--help") || hasFlag("-h")) {
    process.stdout.write(commandHelp(cmd) + "\n");
    return;
  }

  const workspace = resolveWorkspace();
  const stateRoot = getArg("--state-root");
  diagnostics.configureStatePath(diagnosticsStatePath(workspace, stateRoot));
  const enableProfiling = hasFlag("--profile");

  if (enableProfiling) {
    profiler.enable();
    console.error("Profiling enabled");
  }

  const handlers: Partial<Record<string, () => void | Promise<void>>> = {
    build: async () => {
      const manifest = await buildIndex(workspace, "full");
      writeOutput({ ok: true, mode: "full", manifest });
    },
    refresh: async () => {
      const mode = getArg("--mode", "changed") as BuildMode;
      const manifest = await buildIndex(workspace, mode, { state_root: stateRoot });
      writeOutput(withAgentGuidance("refresh", { ok: true, mode, manifest }));
    },
    status: async () => {
      const status = await getStatus(workspace, { state_root: stateRoot });
      writeOutput(withAgentGuidance("status", status));
    },
    init: async () => {
      const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
      const mode = (getArg("--mode", "changed") ?? "changed") as BuildMode;
      const result = await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        mode,
        refresh_if_stale: refreshIfStale,
      });
      writeOutput(result);
    },
    discover: async () => {
      const query = getArg("--query", "") ?? "";
      const intent = (getArg("--intent", "auto") ?? "auto") as "auto" | "code" | "docs" | "symbols";
      const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
      const initResult = await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const discovered = await discoverIndex(workspace, query, {
        prefer_code: true,
        intent,
        state_root: stateRoot,
      });
      writeOutput(
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
    lookup: async () => {
      const query = getArg("--query", "") ?? "";
      const intent = (getArg("--intent", "auto") ?? "auto") as "auto" | "code" | "docs" | "symbols";
      const result = await lookupIndex(workspace, query, {
        intent,
        prefer_code: true,
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("lookup", result, { query }));
    },
    files: async () => {
      const query = getArg("--query", "") ?? "";
      const limit = Number(getArg("--limit", "20") ?? "20");
      const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
      await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const items = await queryFiles(workspace, query, Number.isFinite(limit) ? limit : 20, {
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("files", { items }, { query }));
    },
    symbols: async () => {
      const query = getArg("--query", "") ?? "";
      const limit = Number(getArg("--limit", "20") ?? "20");
      const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
      await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const items = await querySymbols(workspace, query, Number.isFinite(limit) ? limit : 20, {
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("symbols", { items }, { query }));
    },
    search: async () => {
      const query = getArg("--query", "") ?? "";
      const limit = Number(getArg("--limit", "10") ?? "10");
      const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
      const preferCode = (getArg("--prefer-code", "1") ?? "1") !== "0";
      const intent = (getArg("--intent", "auto") ?? "auto") as "auto" | "code" | "docs" | "symbols";
      await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: refreshIfStale,
      });
      const items = await queryChunks(workspace, query, Number.isFinite(limit) ? limit : 10, {
        prefer_code: preferCode,
        intent,
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("search", { items }, { query }));
    },
    "web-search": async () => {
      const query = getArg("--query", "") ?? "";
      const limit = Number(getArg("--limit", "8") ?? "8");
      const timeout_ms = Number(getArg("--timeout-ms", "5000") ?? "5000");
      const debug = (getArg("--debug", "0") ?? "0") === "1";
      const result = await webSearch(workspace, {
        query,
        limit: Number.isFinite(limit) ? limit : 8,
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 5000,
        debug,
      });
      writeOutput(withAgentGuidance("web_search", result, { query }));
    },
    "fetch-url": async () => {
      const url = getArg("--url", "") ?? "";
      const formatRaw = getArg("--format", "markdown") ?? "markdown";
      const format = formatRaw === "text" || formatRaw === "html" ? formatRaw : "markdown";
      const timeout_ms = Number(getArg("--timeout-ms", "8000") ?? "8000");
      const max_bytes = Number(getArg("--max-bytes", "200000") ?? "200000");
      const result = await fetchUrl({
        url,
        format,
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 8000,
        max_bytes: Number.isFinite(max_bytes) ? max_bytes : 200000,
      });
      writeOutput(withAgentGuidance("fetch_url", result, { query: url }));
    },
    diagnostics: () => {
      const data = diagnostics.getDiagnostics();
      writeOutput(withAgentGuidance("diagnostics", data));
    },
    "git-status": () => {
      const timeout_ms = Number(getArg("--timeout-ms", "5000") ?? "5000");
      const result = gitStatus(workspace, {
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 5000,
      });
      writeOutput(withAgentGuidance("git_status", result));
    },
    "git-log": () => {
      const timeout_ms = Number(getArg("--timeout-ms", "8000") ?? "8000");
      const limit = Number(getArg("--limit", "30") ?? "30");
      const result = gitLog(workspace, {
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 8000,
        limit: Number.isFinite(limit) ? limit : 30,
        since: getArg("--since"),
        author: getArg("--author"),
        grep: getArg("--grep"),
      });
      writeOutput(withAgentGuidance("git_log", result));
    },
    "git-diff": () => {
      const timeout_ms = Number(getArg("--timeout-ms", "5000") ?? "5000");
      const max_bytes = Number(getArg("--max-bytes", "64000") ?? "64000");
      const result = gitDiff(workspace, {
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 5000,
        max_bytes: Number.isFinite(max_bytes) ? max_bytes : 64000,
        staged: (getArg("--staged", "0") ?? "0") === "1",
        name_only: (getArg("--name-only", "0") ?? "0") === "1",
        path: getArg("--path"),
        base: getArg("--base"),
        head: getArg("--head"),
      });
      writeOutput(withAgentGuidance("git_diff", result));
    },
    "git-show": () => {
      const rev = getArg("--rev", "") ?? "";
      const timeout_ms = Number(getArg("--timeout-ms", "8000") ?? "8000");
      const max_bytes = Number(getArg("--max-bytes", "64000") ?? "64000");
      const result = gitShow(workspace, {
        rev,
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 8000,
        max_bytes: Number.isFinite(max_bytes) ? max_bytes : 64000,
        path: getArg("--path"),
        patch: (getArg("--patch", "1") ?? "1") !== "0",
      });
      writeOutput(withAgentGuidance("git_show", result));
    },
    "gh-lookup": async () => {
      const repo = getArg("--repo", "") ?? "";
      const kind = (getArg("--kind", "repo_context") ?? "repo_context") as
        | "repo_context"
        | "issues"
        | "prs"
        | "checks";
      const limit = Number(getArg("--limit", "10") ?? "10");
      const timeout_ms = Number(getArg("--timeout-ms", "12000") ?? "12000");
      const query = getArg("--query");
      const result = await ghLookup(workspace, {
        repo,
        kind,
        query,
        limit: Number.isFinite(limit) ? limit : 10,
        timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 12000,
        state_root: stateRoot,
        temp_root: getArg("--temp-root"),
      });
      writeOutput(withAgentGuidance("gh_lookup", result, { query: query ?? repo }));
    },
  };

  const run = handlers[cmd];
  if (run) {
    await run();
    return;
  }

  if (enableProfiling) {
    console.error("\n" + profiler.report());
  }

  process.stderr.write(cliHelp() + "\n");
  process.exitCode = 1;
}

export const __internalCli = {
  cliHelp,
  commandHelp,
  isHelpToken,
};

const meta = import.meta as unknown as Record<string, unknown>;
const sourceSuffix = sep + "src" + sep + "cli.ts";
const isSourceModule = fileURLToPath(import.meta.url).endsWith(sourceSuffix);
const argvRefsSource = process.argv.some(
  (arg) => arg.endsWith(sep + "src" + sep + "cli.ts") || arg === "src/cli.ts",
);
if (isSourceModule && (meta.main === true || argvRefsSource)) {
  runCli().catch((error: unknown) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
