import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "./cli";
import { startServer } from "./server";

function usage(): string {
  return [
    "Usage: veil <server|cli> [args...]",
    "  veil server               Start MCP stdio server",
    "  veil cli <command...>     Run existing Veil CLI commands",
    "Examples:",
    "  veil server",
    "  veil cli status",
    '  veil cli discover --query "homebrew pnpm"',
  ].join("\n");
}

type BinRoute = { type: "server" } | { type: "cli"; argv: string[] } | { type: "usage" };

function route(argv: string[]): BinRoute {
  const cmd = argv[2];
  if (cmd === "server") return { type: "server" };
  if (cmd === "cli") {
    return {
      type: "cli",
      argv: [argv[0] ?? "bun", argv[1] ?? "src/cli.ts", ...argv.slice(3)],
    };
  }
  return { type: "usage" };
}

function defaultLoad(specifier: string): Promise<unknown> {
  if (specifier === "./server") {
    return startServer().then(() => ({}));
  }
  if (specifier === "./cli") {
    return runCli().then(() => ({}));
  }
  return import(specifier);
}

async function main(load: (specifier: string) => Promise<unknown> = defaultLoad): Promise<void> {
  const selected = route(process.argv);

  if (selected.type === "server") {
    await load("./server");
    return;
  }

  if (selected.type === "cli") {
    process.argv = selected.argv;
    await load("./cli");
    return;
  }

  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}

async function runMain(runner: () => Promise<void> = main): Promise<void> {
  try {
    await runner();
  } catch (error: unknown) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  }
}

export const __internalBin = {
  usage,
  route,
  defaultLoad,
  main,
  runMain,
};

function isMainModule(metaUrl: string): boolean {
  const meta = import.meta as unknown as Record<string, unknown>;
  if (typeof meta.main === "boolean") {
    return meta.main;
  }

  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }

  return resolve(argv1) === resolve(fileURLToPath(metaUrl));
}

const isMain = isMainModule(import.meta.url);

if (isMain) {
  void runMain();
}
