import { discoverIndex, getStatus, queryChunks, queryFiles, querySymbols } from "./indexer";

type Case = {
  name: string;
  run: () => Promise<unknown>;
};

type Sample = {
  name: string;
  ms: number;
  phase: "cold" | "warm";
};

const nowMs =
  typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
    ? (): number => Number(Bun.nanoseconds()) / 1_000_000
    : (): number => Date.now();

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function summarize(samples: Sample[], phase: "cold" | "warm", name: string): Record<string, number> {
  const values = samples
    .filter((sample) => sample.phase === phase && sample.name === name)
    .map((sample) => sample.ms);
  if (values.length === 0) {
    return { count: 0, avg_ms: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0, max_ms: 0 };
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    avg_ms: Number(avg.toFixed(4)),
    p50_ms: Number(percentile(values, 50).toFixed(4)),
    p95_ms: Number(percentile(values, 95).toFixed(4)),
    p99_ms: Number(percentile(values, 99).toFixed(4)),
    max_ms: Number(Math.max(...values).toFixed(4)),
  };
}

async function measure(caseDef: Case, iterations: number, phase: "cold" | "warm"): Promise<Sample[]> {
  const out: Sample[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = nowMs();
    await caseDef.run();
    const end = nowMs();
    out.push({ name: caseDef.name, ms: end - start, phase });
  }
  return out;
}

async function main(): Promise<void> {
  const workspaceArgIndex = process.argv.indexOf("--workspace");
  const workspace = workspaceArgIndex >= 0 ? process.argv[workspaceArgIndex + 1] : process.cwd();
  const warmArgIndex = process.argv.indexOf("--warm");
  const warmIterationsRaw = warmArgIndex >= 0 ? Number(process.argv[warmArgIndex + 1]) : 50;
  const warmIterations = Number.isFinite(warmIterationsRaw) && warmIterationsRaw > 0 ? Math.floor(warmIterationsRaw) : 50;

  const cases: Case[] = [
    { name: "status", run: async () => getStatus(workspace) },
    { name: "files:homebrew", run: async () => queryFiles(workspace, "homebrew", 20) },
    { name: "symbols:managedInstallsEnabled", run: async () => querySymbols(workspace, "managedInstallsEnabled", 20) },
    {
      name: "search:pnpm install",
      run: async () => queryChunks(workspace, "pnpm install", 10, { prefer_code: true }),
    },
    {
      name: "search:homebrew enable",
      run: async () => queryChunks(workspace, "homebrew enable", 10, { prefer_code: true }),
    },
    {
      name: "search:path+lang filter",
      run: async () => queryChunks(workspace, "build with installs", 10, { prefer_code: true, path_prefix: "just", language: "text" }),
    },
    {
      name: "search:noisy prompt",
      run: async () =>
        queryChunks(workspace, "without editing files find where homebrew pnpm build is configured", 10, {
          prefer_code: true,
          intent: "code",
        }),
    },
    {
      name: "discover:homebrew pnpm build",
      run: async () =>
        discoverIndex(workspace, "homebrew pnpm build", {
          files_limit: 20,
          symbols_limit: 20,
          search_limit: 10,
          prefer_code: true,
        }),
    },
  ];

  const samples: Sample[] = [];
  for (const caseDef of cases) {
    samples.push(...(await measure(caseDef, 1, "cold")));
  }
  for (const caseDef of cases) {
    samples.push(...(await measure(caseDef, warmIterations, "warm")));
  }

  const metrics: Record<string, { cold: Record<string, number>; warm: Record<string, number> }> = {};
  for (const caseDef of cases) {
    metrics[caseDef.name] = {
      cold: summarize(samples, "cold", caseDef.name),
      warm: summarize(samples, "warm", caseDef.name),
    };
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        workspace,
        timestamp: new Date().toISOString(),
        warm_iterations: warmIterations,
        metrics,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
