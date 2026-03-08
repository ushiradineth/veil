import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { discoverIndex, getStatus, queryChunks, queryFiles, querySymbols } from "./indexer";

const nowMs =
  typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
    ? (): number => Bun.nanoseconds() / 1_000_000
    : (): number => performance.now();

type BenchResult = {
  name: string;
  veil_ms: number;
  traditional_ms: number;
  speedup: string;
  winner: "veil" | "traditional";
};

function runCommand(cmd: string, args: string[], cwd: string): number {
  const start = nowMs();
  spawnSync(cmd, args, { cwd, encoding: "utf-8", stdio: "pipe" });
  return nowMs() - start;
}

async function benchmarkFileSearch(workspace: string): Promise<BenchResult> {
  // Warm up veil cache
  await queryFiles(workspace, "homebrew", 20);

  // Veil approach
  const veilStart = nowMs();
  await queryFiles(workspace, "homebrew", 20);
  const veilTime = nowMs() - veilStart;

  // Traditional approach: find + grep
  const traditionalTime = runCommand(
    "find",
    [".", "-type", "f", "-name", "*homebrew*", "-o", "-path", "*homebrew*"],
    workspace,
  );

  return {
    name: "File Search (find files matching 'homebrew')",
    veil_ms: Number(veilTime.toFixed(4)),
    traditional_ms: Number(traditionalTime.toFixed(4)),
    speedup: `${(traditionalTime / veilTime).toFixed(1)}x`,
    winner: veilTime < traditionalTime ? "veil" : "traditional",
  };
}

async function benchmarkSymbolSearch(workspace: string): Promise<BenchResult> {
  // Warm up veil cache
  await querySymbols(workspace, "build", 20);

  // Veil approach
  const veilStart = nowMs();
  await querySymbols(workspace, "build", 20);
  const veilTime = nowMs() - veilStart;

  // Traditional approach: grep for function/class definitions
  const traditionalTime = runCommand(
    "grep",
    ["-r", "-E", "(function|class|def|const|let|var).*build", "."],
    workspace,
  );

  return {
    name: "Symbol Search (find 'build' functions/classes)",
    veil_ms: Number(veilTime.toFixed(4)),
    traditional_ms: Number(traditionalTime.toFixed(4)),
    speedup: `${(traditionalTime / veilTime).toFixed(1)}x`,
    winner: veilTime < traditionalTime ? "veil" : "traditional",
  };
}

async function benchmarkCodeSearch(workspace: string): Promise<BenchResult> {
  // Warm up veil cache
  await queryChunks(workspace, "pnpm install", 10, { prefer_code: true });

  // Veil approach
  const veilStart = nowMs();
  await queryChunks(workspace, "pnpm install", 10, { prefer_code: true });
  const veilTime = nowMs() - veilStart;

  // Traditional approach: ripgrep
  const traditionalTime = runCommand("rg", ["pnpm install", "--max-count", "10"], workspace);

  return {
    name: "Code Search (find 'pnpm install' in code)",
    veil_ms: Number(veilTime.toFixed(4)),
    traditional_ms: Number(traditionalTime.toFixed(4)),
    speedup: `${(traditionalTime / veilTime).toFixed(1)}x`,
    winner: veilTime < traditionalTime ? "veil" : "traditional",
  };
}

async function benchmarkDiscovery(workspace: string): Promise<BenchResult> {
  // Warm up veil cache
  await discoverIndex(workspace, "homebrew pnpm", {
    files_limit: 20,
    symbols_limit: 20,
    search_limit: 10,
    prefer_code: true,
  });

  // Veil approach: single call gets files + symbols + chunks
  const veilStart = nowMs();
  await discoverIndex(workspace, "homebrew pnpm", {
    files_limit: 20,
    symbols_limit: 20,
    search_limit: 10,
    prefer_code: true,
  });
  const veilTime = nowMs() - veilStart;

  // Traditional approach: multiple sequential calls
  const traditionalStart = nowMs();
  runCommand(
    "find",
    [".", "-type", "f", "-name", "*homebrew*", "-o", "-name", "*pnpm*"],
    workspace,
  );
  runCommand("grep", ["-r", "-E", "(function|class|def).*homebrew", "."], workspace);
  runCommand("grep", ["-r", "-E", "(function|class|def).*pnpm", "."], workspace);
  runCommand("rg", ["homebrew", "--max-count", "10"], workspace);
  runCommand("rg", ["pnpm", "--max-count", "10"], workspace);
  const traditionalTime = nowMs() - traditionalStart;

  return {
    name: "Discovery (files + symbols + code search combined)",
    veil_ms: Number(veilTime.toFixed(4)),
    traditional_ms: Number(traditionalTime.toFixed(4)),
    speedup: `${(traditionalTime / veilTime).toFixed(1)}x`,
    winner: veilTime < traditionalTime ? "veil" : "traditional",
  };
}

async function benchmarkColdStart(workspace: string): Promise<BenchResult> {
  // Veil approach: status check (reads manifest)
  const veilStart = nowMs();
  await getStatus(workspace);
  const veilTime = nowMs() - veilStart;

  // Traditional approach: git status + find count
  const traditionalStart = nowMs();
  runCommand("git", ["status"], workspace);
  runCommand("find", [".", "-type", "f"], workspace);
  const traditionalTime = nowMs() - traditionalStart;

  return {
    name: "Status Check (get repository info)",
    veil_ms: Number(veilTime.toFixed(4)),
    traditional_ms: Number(traditionalTime.toFixed(4)),
    speedup: `${(traditionalTime / veilTime).toFixed(1)}x`,
    winner: veilTime < traditionalTime ? "veil" : "traditional",
  };
}

async function main(): Promise<void> {
  const workspaceArgIndex = process.argv.indexOf("--workspace");
  const workspace = workspaceArgIndex >= 0 ? process.argv[workspaceArgIndex + 1] : process.cwd();

  console.log("\n=== Veil vs Traditional Tools Benchmark ===\n");
  console.log(`Workspace: ${workspace}\n`);

  // Ensure index exists
  const status = await getStatus(workspace);
  if (!status.exists) {
    console.error(
      "Error: Index not found. Run 'bun run src/cli.ts build --workspace <path>' first.",
    );
    process.exit(1);
  }

  const fileCount = String(status.manifest?.file_count ?? 0);
  const symbolCount = String(status.manifest?.symbol_count ?? 0);
  const chunkCount = String(status.manifest?.chunk_count ?? 0);
  console.log(`Repository: ${fileCount} files, ${symbolCount} symbols, ${chunkCount} chunks\n`);

  const results: BenchResult[] = [];

  console.log("Running benchmarks...\n");

  results.push(await benchmarkColdStart(workspace));
  console.log("✓ Status check");

  results.push(await benchmarkFileSearch(workspace));
  console.log("✓ File search");

  results.push(await benchmarkSymbolSearch(workspace));
  console.log("✓ Symbol search");

  results.push(await benchmarkCodeSearch(workspace));
  console.log("✓ Code search");

  results.push(await benchmarkDiscovery(workspace));
  console.log("✓ Discovery");

  console.log("\n=== Results ===\n");

  // Print table
  console.log(
    "┌─────────────────────────────────────────────────────┬──────────────┬──────────────────┬──────────┬──────────────┐",
  );
  console.log(
    "│ Benchmark                                           │ Veil (ms)    │ Traditional (ms) │ Speedup  │ Winner       │",
  );
  console.log(
    "├─────────────────────────────────────────────────────┼──────────────┼──────────────────┼──────────┼──────────────┤",
  );

  for (const result of results) {
    const name = result.name.padEnd(51);
    const veil = String(result.veil_ms).padStart(12);
    const trad = String(result.traditional_ms).padStart(16);
    const speedup = result.speedup.padStart(8);
    const winner = result.winner.padEnd(12);
    console.log(`│ ${name} │ ${veil} │ ${trad} │ ${speedup} │ ${winner} │`);
  }

  console.log(
    "└─────────────────────────────────────────────────────┴──────────────┴──────────────────┴──────────┴──────────────┘",
  );

  // Summary
  const veilWins = results.filter((r) => r.winner === "veil").length;
  const avgSpeedup =
    results.reduce((sum, r) => {
      const speedup = parseFloat(r.speedup);
      return sum + speedup;
    }, 0) / results.length;

  console.log(`\n=== Summary ===\n`);
  console.log(`Veil wins: ${String(veilWins)}/${String(results.length)} benchmarks`);
  console.log(`Average speedup: ${avgSpeedup.toFixed(1)}x faster than traditional tools`);
  console.log(`\nNote: Traditional tools include find, grep, rg (ripgrep), and git.`);
  console.log(`Veil uses pre-built indexes for instant retrieval.\n`);

  // Export JSON
  const output = {
    workspace,
    timestamp: new Date().toISOString(),
    repository: {
      files: status.manifest?.file_count,
      symbols: status.manifest?.symbol_count,
      chunks: status.manifest?.chunk_count,
    },
    results,
    summary: {
      veil_wins: veilWins,
      total_benchmarks: results.length,
      average_speedup: Number(avgSpeedup.toFixed(1)),
    },
  };

  process.stdout.write(`\nJSON output:\n${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
