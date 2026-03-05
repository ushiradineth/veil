function usage(): string {
  return [
    "Usage: veil <server|cli> [args...]",
    "  veil server               Start MCP stdio server",
    "  veil cli <command...>     Run existing Veil CLI commands",
    "Examples:",
    "  veil server",
    "  veil cli status",
    "  veil cli discover --query \"homebrew pnpm\"",
  ].join("\n");
}

type BinRoute =
  | { type: "server" }
  | { type: "cli"; argv: string[] }
  | { type: "usage" };

function route(argv: string[]): BinRoute {
  const cmd = argv[2];
  if (cmd === "server") return { type: "server" };
  if (cmd === "cli") {
    return {
      type: "cli",
      argv: [argv[0] ?? "bun", argv[1] ?? "src/cli.ts", ...(argv.slice(3) ?? [])],
    };
  }
  return { type: "usage" };
}

async function main(): Promise<void> {
  const selected = route(process.argv);

  if (selected.type === "server") {
    await import("./server");
    return;
  }

  if (selected.type === "cli") {
    process.argv = selected.argv;
    await import("./cli");
    return;
  }

  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}

export const __internalBin = {
  usage,
  route,
};

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
