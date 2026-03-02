import { performance } from "node:perf_hooks";
import { discoverIndex, getStatus, queryChunks, queryFiles, querySymbols } from "./indexer";

const nowMs =
  typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
    ? (): number => Number(Bun.nanoseconds()) / 1_000_000
    : (): number => performance.now();

type Sample = {
  label: string;
  ms: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

async function measure(label: string, iterations: number, fn: () => Promise<unknown>): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = nowMs();
    await fn();
    const end = nowMs();
    samples.push({ label, ms: end - start });
  }
  return samples;
}

function summarize(samples: Sample[], label: string): Record<string, number> {
  const values = samples.filter((s) => s.label === label).map((s) => s.ms);
  if (values.length === 0) {
    return { count: 0, avg_ms: 0, p50_ms: 0, p95_ms: 0, max_ms: 0 };
  }
  const avg = values.reduce((acc, n) => acc + n, 0) / values.length;
  return {
    count: values.length,
    avg_ms: Number(avg.toFixed(3)),
    p50_ms: Number(percentile(values, 50).toFixed(3)),
    p95_ms: Number(percentile(values, 95).toFixed(3)),
    max_ms: Number(Math.max(...values).toFixed(3)),
  };
}

async function main(): Promise<void> {
  const workspaceArgIndex = process.argv.indexOf("--workspace");
  const workspace = workspaceArgIndex >= 0 ? process.argv[workspaceArgIndex + 1] : process.cwd();
  const iterationsArgIndex = process.argv.indexOf("--iterations");
  const iterationsRaw = iterationsArgIndex >= 0 ? Number(process.argv[iterationsArgIndex + 1]) : 30;
  const iterations = Number.isFinite(iterationsRaw) && iterationsRaw > 0 ? Math.floor(iterationsRaw) : 30;

  await getStatus(workspace);

  const results: Sample[] = [];
  results.push(...(await measure("status", iterations, async () => getStatus(workspace))));
  results.push(...(await measure("files:homebrew", iterations, async () => queryFiles(workspace, "homebrew", 20))));
  results.push(...(await measure("symbols:build", iterations, async () => querySymbols(workspace, "build", 20))));
  results.push(
    ...(await measure("search:pnpm install", iterations, async () =>
      queryChunks(workspace, "pnpm install", 10, { prefer_code: true }),
    )),
  );
  results.push(
    ...(await measure("search:homebrew enable", iterations, async () =>
      queryChunks(workspace, "homebrew enable", 10, { prefer_code: true }),
    )),
  );
  results.push(
    ...(await measure("search:noisy prompt", iterations, async () =>
      queryChunks(workspace, "without editing files find where homebrew pnpm build is configured", 10, {
        prefer_code: true,
        intent: "code",
      }),
    )),
  );
  results.push(
    ...(await measure("discover:homebrew pnpm build", iterations, async () =>
      discoverIndex(workspace, "homebrew pnpm build", {
        files_limit: 20,
        symbols_limit: 20,
        search_limit: 10,
        prefer_code: true,
      }),
    )),
  );

  const summary = {
    workspace,
    iterations,
    timestamp: new Date().toISOString(),
    metrics: {
      status: summarize(results, "status"),
      "files:homebrew": summarize(results, "files:homebrew"),
      "symbols:build": summarize(results, "symbols:build"),
        "search:pnpm install": summarize(results, "search:pnpm install"),
        "search:homebrew enable": summarize(results, "search:homebrew enable"),
        "search:noisy prompt": summarize(results, "search:noisy prompt"),
        "discover:homebrew pnpm build": summarize(results, "discover:homebrew pnpm build"),
      },
    };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
