import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "./cli";
import { CLI_COMMANDS, CLI_COMMAND_DESCRIPTIONS } from "./tool-contract";

function isHelpToken(cmd: string): boolean {
  return cmd === "help" || cmd === "--help" || cmd === "-h";
}

function usage(): string {
  const lines = ["Veil", "", "Usage:", "  veil <command> [options]", "", "Commands:"];
  for (const name of CLI_COMMANDS) {
    lines.push("  " + name.padEnd(12) + " " + CLI_COMMAND_DESCRIPTIONS[name]);
  }
  lines.push("  mcp server".padEnd(15) + " Start MCP stdio server");
  lines.push("");
  lines.push("Options:");
  lines.push("  -h, --help     Show help");
  lines.push("");
  lines.push("Examples:");
  lines.push("  veil status --workspace .");
  lines.push('  veil discover --workspace . --query "build index"');
  lines.push("  veil mcp server");
  return lines.join("\n");
}

function mcpUsage(): string {
  return [
    "Veil MCP",
    "",
    "Usage:",
    "  veil mcp server",
    "",
    "Subcommands:",
    "  server    Start MCP stdio server",
  ].join("\n");
}

type BinRoute =
  | { type: "cli"; argv: string[] }
  | { type: "mcp_server" }
  | { type: "mcp_usage"; ok: boolean }
  | { type: "help" }
  | { type: "usage" };

function isCliCommand(cmd: string): boolean {
  return (CLI_COMMANDS as readonly string[]).includes(cmd);
}

function route(argv: string[]): BinRoute {
  const cmd = argv[2];
  if (!cmd || isHelpToken(cmd)) {
    return { type: "help" };
  }

  if (cmd === "mcp") {
    const sub = argv[3];
    if (!sub || isHelpToken(sub)) {
      return { type: "mcp_usage", ok: true };
    }
    if (sub === "server") {
      return { type: "mcp_server" };
    }
    return { type: "mcp_usage", ok: false };
  }

  if (isCliCommand(cmd)) {
    return {
      type: "cli",
      argv: [argv[0] ?? "bun", argv[1] ?? "src/cli.ts", ...argv.slice(2)],
    };
  }

  return { type: "usage" };
}

function defaultLoad(specifier: string): Promise<unknown> {
  if (specifier === "./server") {
    return import("./server").then((mod) => mod.startServer());
  }
  if (specifier === "./cli") {
    return runCli().then(() => ({}));
  }
  return import(specifier);
}

async function main(load: (specifier: string) => Promise<unknown> = defaultLoad): Promise<void> {
  const selected = route(process.argv);

  if (selected.type === "help") {
    process.stdout.write(usage() + "\n");
    return;
  }

  if (selected.type === "mcp_server") {
    await load("./server");
    return;
  }

  if (selected.type === "mcp_usage") {
    const output = mcpUsage() + "\n";
    if (selected.ok) {
      process.stdout.write(output);
      return;
    }
    process.stderr.write(output);
    process.exitCode = 1;
    return;
  }

  if (selected.type === "cli") {
    process.argv = selected.argv;
    await load("./cli");
    return;
  }

  process.stderr.write(usage() + "\n");
  process.exitCode = 1;
}

async function runMain(runner: () => Promise<void> = main): Promise<void> {
  try {
    await runner();
  } catch (error: unknown) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}

export const __internalBin = {
  usage,
  mcpUsage,
  isCliCommand,
  isHelpToken,
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
