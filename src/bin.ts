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

// Bun uses import.meta.main, Node does not define it.
// Support both runtimes so the esbuild bundle works on Node.
const meta = import.meta as unknown as Record<string, unknown>;
const isMain = typeof meta.main === "boolean" ? meta.main : true;

if (isMain) {
  void runMain();
}
