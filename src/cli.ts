import { buildIndex, discoverIndex, getStatus, lookupIndex, shouldRefreshDiscover } from "./indexer";
import type { BuildMode } from "./types";
import { profiler, diagnostics } from "./diagnostics";

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

  if (enableProfiling) {
    console.error("\n" + profiler.report());
  }

  process.stderr.write(
    "Usage: bun run src/cli.ts <build|refresh|status|discover|lookup|diagnostics> [--workspace <path>] [--mode full|changed] [--query <text>] [--profile]\n",
  );
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
