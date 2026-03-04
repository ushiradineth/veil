import { buildIndex, discoverIndex, getStatus, lookupIndex, shouldRefreshDiscover } from "./indexer";
import type { BuildMode } from "./types";
import { profiler, diagnostics } from "./diagnostics";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";

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

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "status";
  const workspace = resolveWorkspace();
  const enableProfiling = hasFlag("--profile");

  if (enableProfiling) {
    profiler.enable();
    console.error("Profiling enabled");
  }

  if (cmd === "build") {
    const manifest = await buildIndex(workspace, "full");
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "full", manifest }, null, 2)}\n`);
    return;
  }

  if (cmd === "refresh") {
    const mode = (getArg("--mode", "changed") as BuildMode) ?? "changed";
    const manifest = await buildIndex(workspace, mode);
    process.stdout.write(`${JSON.stringify({ ok: true, mode, manifest }, null, 2)}\n`);
    return;
  }

  if (cmd === "status") {
    const status = await getStatus(workspace);
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }

  if (cmd === "discover") {
    const query = getArg("--query", "") ?? "";
    const intent = (getArg("--intent", "auto") ?? "auto") as "auto" | "code" | "docs" | "symbols";
    const refreshIfStale = (getArg("--refresh-if-stale", "1") ?? "1") !== "0";
    let status = await getStatus(workspace);
    if (shouldRefreshDiscover(status) && refreshIfStale) {
      await buildIndex(workspace, "changed");
      status = await getStatus(workspace);
    }
    const discovered = await discoverIndex(workspace, query, { prefer_code: true, intent });
    process.stdout.write(
      `${JSON.stringify(
        { status, intent: discovered.intent, files: discovered.files, symbols: discovered.symbols, chunks: discovered.chunks },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (cmd === "lookup") {
    const query = getArg("--query", "") ?? "";
    const intent = (getArg("--intent", "auto") ?? "auto") as "auto" | "code" | "docs" | "symbols";
    const result = await lookupIndex(workspace, query, { intent, prefer_code: true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (cmd === "diagnostics") {
    const data = diagnostics.getDiagnostics();
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  if (cmd === "git-status") {
    const timeout_ms = Number(getArg("--timeout-ms", "5000") ?? "5000");
    const result = gitStatus(workspace, { timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 5000 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (cmd === "gh-lookup") {
    const repo = getArg("--repo", "") ?? "";
    const kind = (getArg("--kind", "issues") ?? "issues") as "issues" | "prs" | "checks";
    const limit = Number(getArg("--limit", "10") ?? "10");
    const timeout_ms = Number(getArg("--timeout-ms", "12000") ?? "12000");
    const result = ghLookup(workspace, {
      repo,
      kind,
      query: getArg("--query"),
      limit: Number.isFinite(limit) ? limit : 10,
      timeout_ms: Number.isFinite(timeout_ms) ? timeout_ms : 12000,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (enableProfiling) {
    console.error("\n" + profiler.report());
  }

  process.stderr.write(
    "Usage: bun run src/cli.ts <build|refresh|status|discover|lookup|diagnostics|git-status|git-log|git-diff|git-show|gh-lookup> [--workspace <path>] [--mode full|changed] [--query <text>] [--profile]\n",
  );
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
