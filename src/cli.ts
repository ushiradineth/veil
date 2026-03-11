import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { profiler, diagnostics } from "./diagnostics";
import { fetchUrl } from "./fetch-url";
import { toToon } from "./format";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
import { buildIndex, discoverIndex, getStatus, initWorkspaceIndex, lookupIndex } from "./indexer";
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

function resolveWorkspace(): string {
  return getArg("--workspace") ?? process.cwd();
}

function writeOutput(data: unknown): void {
  process.stdout.write(`${toToon(data)}\n`);
}

export async function runCli(): Promise<void> {
  const cmd = process.argv[2] ?? "status";
  const workspace = resolveWorkspace();
  const stateRoot = getArg("--state-root");
  if (stateRoot) {
    process.env.VEIL_STATE_ROOT = stateRoot;
  }
  diagnostics.configureStatePath(diagnosticsStatePath(workspace, stateRoot));
  const enableProfiling = hasFlag("--profile");

  if (enableProfiling) {
    profiler.enable();
    console.error("Profiling enabled");
  }

  if (cmd === "build") {
    const manifest = await buildIndex(workspace, "full");
    writeOutput({ ok: true, mode: "full", manifest });
    return;
  }

  if (cmd === "refresh") {
    const mode = getArg("--mode", "changed") as BuildMode;
    const manifest = await buildIndex(workspace, mode, { state_root: stateRoot });
    writeOutput({ ok: true, mode, manifest });
    return;
  }

  if (cmd === "status") {
    const status = await getStatus(workspace, { state_root: stateRoot });
    writeOutput(status);
    return;
  }

  if (cmd === "init") {
    const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
    const mode = (getArg("--mode", "changed") ?? "changed") as BuildMode;
    const result = await initWorkspaceIndex(workspace, {
      state_root: stateRoot,
      mode,
      refresh_if_stale: refreshIfStale,
    });
    writeOutput(result);
    return;
  }

  if (cmd === "discover") {
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
    writeOutput({
      status: initResult.status_after,
      intent: discovered.intent,
      files: discovered.files,
      symbols: discovered.symbols,
      chunks: discovered.chunks,
    });
    return;
  }

  if (cmd === "lookup") {
    const query = getArg("--query", "") ?? "";
    const intent = (getArg("--intent", "auto") ?? "auto") as "auto" | "code" | "docs" | "symbols";
    const result = await lookupIndex(workspace, query, {
      intent,
      prefer_code: true,
      state_root: stateRoot,
    });
    writeOutput(result);
    return;
  }

  if (cmd === "web-search") {
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
    writeOutput(result);
    return;
  }

  if (cmd === "fetch-url") {
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
    writeOutput(result);
    return;
  }

  if (cmd === "diagnostics") {
    const data = diagnostics.getDiagnostics();
    writeOutput(data);
    return;
  }

  if (cmd === "git-status") {
    const timeout_ms = Number(getArg("--timeout-ms", "5000") ?? "5000");
    const result = gitStatus(workspace, {
      timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 5000,
    });
    writeOutput(result);
    return;
  }

  if (cmd === "git-log") {
    const timeout_ms = Number(getArg("--timeout-ms", "8000") ?? "8000");
    const limit = Number(getArg("--limit", "30") ?? "30");
    const result = gitLog(workspace, {
      timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 8000,
      limit: Number.isFinite(limit) ? limit : 30,
      since: getArg("--since"),
      author: getArg("--author"),
      grep: getArg("--grep"),
    });
    writeOutput(result);
    return;
  }

  if (cmd === "git-diff") {
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
    writeOutput(result);
    return;
  }

  if (cmd === "git-show") {
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
    writeOutput(result);
    return;
  }

  if (cmd === "gh-lookup") {
    const repo = getArg("--repo", "") ?? "";
    const kind = (getArg("--kind", "repo_context") ?? "repo_context") as
      | "repo_context"
      | "issues"
      | "prs"
      | "checks";
    const limit = Number(getArg("--limit", "10") ?? "10");
    const timeout_ms = Number(getArg("--timeout-ms", "12000") ?? "12000");
    const result = await ghLookup(workspace, {
      repo,
      kind,
      query: getArg("--query"),
      limit: Number.isFinite(limit) ? limit : 10,
      timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 12000,
      state_root: stateRoot,
      temp_root: getArg("--temp-root"),
    });
    writeOutput(result);
    return;
  }

  if (enableProfiling) {
    console.error("\n" + profiler.report());
  }

  process.stderr.write(
    "Usage: bun run src/cli.ts <build|refresh|status|init|discover|lookup|web-search|fetch-url|diagnostics|git-status|git-log|git-diff|git-show|gh-lookup> [--workspace <path>] [--state-root <.veil|relative|/abs/path>] [--mode full|changed] [--query <text>] [--refresh-if-stale 0|1] [--profile]\nOutput format: TOON\nweb-search providers: google, duckduckgo, wikipedia, github, reddit, deepwiki\nweb-search debug: --debug 1\nfetch-url: --url <https://...> [--format markdown|text|html] [--timeout-ms 8000] [--max-bytes 200000]\n",
  );
  process.exitCode = 1;
}

const meta = import.meta as unknown as Record<string, unknown>;
const sourceSuffix = `${sep}src${sep}cli.ts`;
const isSourceModule = fileURLToPath(import.meta.url).endsWith(sourceSuffix);
const argvRefsSource = process.argv.some(
  (arg) => arg.endsWith(`${sep}src${sep}cli.ts`) || arg === "src/cli.ts",
);
if (isSourceModule && (meta.main === true || argvRefsSource)) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
