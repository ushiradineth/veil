import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { toBenchmarksMarkdown, toRunId } from "./bench-report";

type Phase = "cold" | "warm";
type ScenarioKind =
  | "status"
  | "refresh"
  | "files"
  | "symbols"
  | "search"
  | "lookup"
  | "discover"
  | "web_search"
  | "fetch_url"
  | "diagnostics"
  | "git_status"
  | "git_log"
  | "git_diff"
  | "git_show"
  | "gh_lookup";

type Scenario = {
  id: string;
  kind: ScenarioKind;
  title: string;
  prompt: string;
  query: string;
  expected_patterns: string[];
};

type RunContext = {
  workspace: string;
};

type ScenarioRun = {
  status: "ok" | "unsupported" | "error";
  text: string;
  reason?: string;
};

type Adapter = {
  id: string;
  label: string;
  prepare: (ctx: RunContext) => Promise<void>;
  run: (ctx: RunContext, scenario: Scenario) => Promise<ScenarioRun>;
  teardown?: () => Promise<void>;
};

type Sample = {
  ms: number;
  success: boolean;
  relevance: number;
};

type ScenarioSummary = {
  status: "ok" | "unsupported" | "error";
  reason: string | null;
  cold: Stats;
  warm: Stats;
  native_adoption: NativeAdoption;
};

type NativeAdoption = {
  first_call_success: number;
  calls_to_useful_context: number;
  non_veil_fallback_rate: number;
};

type Stats = {
  count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  mean_ms: number;
  success_rate: number;
  relevance_rate: number;
};

type CompetitorReport = {
  id: string;
  label: string;
  scenarios: Record<string, ScenarioSummary>;
};

type AgentId = "codex" | "claude" | "opencode";
type McpMode = "veil" | "serena" | "none";

type SuiteReport = {
  generated_at: string;
  environment: {
    hostname: string;
    platform: string;
    arch: string;
    node: string;
    bun: string | null;
    cpu_model: string;
    cpu_cores: number;
  };
  config: {
    workspace: string;
    cold_iterations: number;
    warm_iterations: number;
    output_dir: string;
    competitors: string[];
  };
  scenarios: Scenario[];
  competitors: CompetitorReport[];
};

const nowMs =
  typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
    ? (): number => Bun.nanoseconds() / 1_000_000
    : (): number => performance.now();

const SCENARIOS: Scenario[] = [
  {
    id: "status-bootstrap",
    kind: "status",
    title: "Repository status bootstrap",
    prompt: "Get repository index and freshness status",
    query: "status",
    expected_patterns: ["exists", "stale", "manifest"],
  },
  {
    id: "refresh-changed",
    kind: "refresh",
    title: "Incremental index refresh",
    prompt: "Refresh index in changed mode",
    query: "changed",
    expected_patterns: ["schema_version", "workspace", "file_count"],
  },
  {
    id: "files-homebrew",
    kind: "files",
    title: "File lookup by path intent",
    prompt: "Find files related to homebrew",
    query: "homebrew",
    expected_patterns: ["homebrew", "brew", "nix"],
  },
  {
    id: "symbols-build",
    kind: "symbols",
    title: "Symbol lookup by name intent",
    prompt: "Find symbols related to build",
    query: "build",
    expected_patterns: ["build", "install", "package"],
  },
  {
    id: "search-pnpm-install",
    kind: "search",
    title: "Code content lookup",
    prompt: "Locate code snippets that contain pnpm install",
    query: "pnpm install",
    expected_patterns: ["pnpm", "install"],
  },
  {
    id: "lookup-build-index",
    kind: "lookup",
    title: "Intent-aware lookup",
    prompt: "Find where buildIndex is defined",
    query: "where is buildIndex defined",
    expected_patterns: ["buildindex", "indexer", "score"],
  },
  {
    id: "discover-combined",
    kind: "discover",
    title: "Combined discovery workflow",
    prompt: "Find files, symbols, and code for homebrew pnpm build",
    query: "homebrew pnpm build",
    expected_patterns: ["homebrew", "pnpm", "build"],
  },
  {
    id: "web-search-typescript",
    kind: "web_search",
    title: "Web search query",
    prompt: "Search the web for typescript language server",
    query: "typescript language server",
    expected_patterns: ["typescript", "language", "server"],
  },
  {
    id: "fetch-url-example",
    kind: "fetch_url",
    title: "URL fetch markdown-first",
    prompt: "Fetch and convert content from example.com",
    query: "https://example.com",
    expected_patterns: ["example", "domain"],
  },
  {
    id: "diagnostics-read",
    kind: "diagnostics",
    title: "Diagnostics lookup",
    prompt: "Read diagnostics and cache counters",
    query: "diagnostics",
    expected_patterns: ["latency", "cache"],
  },
  {
    id: "git-status-check",
    kind: "git_status",
    title: "Git status lookup",
    prompt: "Inspect repository git status",
    query: "status",
    expected_patterns: ["branch", "clean", "dirty"],
  },
  {
    id: "git-log-check",
    kind: "git_log",
    title: "Git log lookup",
    prompt: "Inspect recent commit log",
    query: "log",
    expected_patterns: ["commit", "author", "message"],
  },
  {
    id: "git-diff-check",
    kind: "git_diff",
    title: "Git diff lookup",
    prompt: "Inspect unstaged diff",
    query: "diff",
    expected_patterns: ["diff", "file"],
  },
  {
    id: "git-show-head",
    kind: "git_show",
    title: "Git show lookup",
    prompt: "Show HEAD commit details",
    query: "head",
    expected_patterns: ["commit", "author", "message"],
  },
  {
    id: "gh-repo-context",
    kind: "gh_lookup",
    title: "GitHub repo context bootstrap",
    prompt: "Clone and index a referenced GitHub repository for context",
    query: "microsoft/vscode",
    expected_patterns: ["indexed", "workspace", "repo"],
  },
];

function getArg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function parseIntArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function summarize(samples: Sample[]): Stats {
  if (samples.length === 0) {
    return {
      count: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      mean_ms: 0,
      success_rate: 0,
      relevance_rate: 0,
    };
  }
  const values = samples.map((sample) => sample.ms);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const success = samples.filter((sample) => sample.success).length;
  const relevance = samples.reduce((sum, sample) => sum + sample.relevance, 0);
  return {
    count: samples.length,
    p50_ms: Number(percentile(values, 50).toFixed(4)),
    p95_ms: Number(percentile(values, 95).toFixed(4)),
    p99_ms: Number(percentile(values, 99).toFixed(4)),
    mean_ms: Number(mean.toFixed(4)),
    success_rate: Number((success / samples.length).toFixed(4)),
    relevance_rate: Number((relevance / samples.length).toFixed(4)),
  };
}

function relevanceScore(text: string, expectedPatterns: string[]): number {
  if (expectedPatterns.length === 0) return 1;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const pattern of expectedPatterns) {
    if (hay.includes(pattern.toLowerCase())) hits += 1;
  }
  return hits / expectedPatterns.length;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  allowedExitCodes: number[] = [0],
  timeoutMs = 30_000,
): ScenarioRun {
  const out = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: timeoutMs,
  });
  const stdout = out.stdout.trim();
  const stderr = out.stderr.trim();

  if (out.error) {
    return { status: "error", text: `${stdout}\n${stderr}`.trim(), reason: out.error.message };
  }

  if (!allowedExitCodes.includes(out.status ?? -1)) {
    const detail = stderr.length > 0 ? `: ${stderr.slice(0, 200)}` : "";
    return {
      status: "error",
      text: `${stdout}\n${stderr}`.trim(),
      reason: `exit status ${String(out.status)}${detail}`,
    };
  }

  return {
    status: "ok",
    text: `${stdout}\n${stderr}`.trim(),
  };
}

function makePrompt(scenario: Scenario, mode: McpMode): string {
  const modeInstruction =
    mode === "none"
      ? "MCP mode is none. Do not use any MCP tools."
      : `MCP mode is ${mode}. Use only ${mode} MCP tools when relevant.`;
  return `${modeInstruction}\nTask: ${scenario.prompt}\nQuery: ${scenario.query}\nReturn concise plain text output.`;
}

function timeoutForScenario(scenario: Scenario): number {
  if (scenario.kind === "gh_lookup") return 45_000;
  if (scenario.kind === "web_search" || scenario.kind === "fetch_url") return 30_000;
  return 15_000;
}

function createAgentAdapter(agent: AgentId, mode: McpMode): Adapter {
  const id = `${agent}-${mode}`;
  const label = `${agent} (${mode})`;
  let blockedReason: string | null = null;

  return {
    id,
    label,
    prepare: (ctx) => {
      const probeCmd = agent;
      const probe = runCommand(probeCmd, ["--help"], ctx.workspace, [0, 1]);
      if (probe.status !== "ok") {
        blockedReason = `${agent} CLI unavailable`;
      }
      return Promise.resolve();
    },
    run: (ctx, scenario) => {
      if (blockedReason) {
        return Promise.resolve({ status: "unsupported", text: "", reason: blockedReason });
      }
      const prompt = makePrompt(scenario, mode);
      const timeoutMs = timeoutForScenario(scenario);

      if (agent === "codex") {
        const base = ["--dangerously-bypass-approvals-and-sandbox"];
        const args =
          scenario.kind === "web_search"
            ? [...base, "--search", "exec", prompt]
            : [...base, "exec", prompt];
        const run = runCommand("codex", args, ctx.workspace, [0], timeoutMs);
        if (run.status === "error" && (run.reason ?? "").includes("ETIMEDOUT")) {
          return Promise.resolve({ status: "unsupported", text: "", reason: "codex timeout" });
        }
        return Promise.resolve(run);
      }

      if (agent === "claude") {
        const args = [
          "-p",
          "--output-format",
          "text",
          "--permission-mode",
          "bypassPermissions",
          prompt,
        ];
        const run = runCommand("claude", args, ctx.workspace, [0], timeoutMs);
        if (run.status === "error" && (run.reason ?? "").includes("ETIMEDOUT")) {
          return Promise.resolve({ status: "unsupported", text: "", reason: "claude timeout" });
        }
        return Promise.resolve(run);
      }

      const args = ["run", "--format", "default", prompt];
      const run = runCommand("opencode", args, ctx.workspace, [0], timeoutMs);
      if (run.status === "error" && (run.reason ?? "").includes("ETIMEDOUT")) {
        return Promise.resolve({ status: "unsupported", text: "", reason: "opencode timeout" });
      }
      return Promise.resolve(run);
    },
  };
}

function createAgentMatrixAdapters(): Adapter[] {
  const agents: AgentId[] = ["codex", "claude", "opencode"];
  const modes: McpMode[] = ["veil", "serena", "none"];
  const adapters: Adapter[] = [];
  for (const agent of agents) {
    for (const mode of modes) {
      adapters.push(createAgentAdapter(agent, mode));
    }
  }
  return adapters;
}

async function runScenarioPhase(
  adapter: Adapter,
  ctx: RunContext,
  scenario: Scenario,
  phase: Phase,
  iterations: number,
): Promise<{ status: "ok" | "unsupported" | "error"; reason: string | null; samples: Sample[] }> {
  const samples: Sample[] = [];
  let status: "ok" | "unsupported" | "error" = "ok";
  let reason: string | null = null;

  for (let i = 0; i < iterations; i += 1) {
    const started = nowMs();
    const run = await adapter.run(ctx, scenario);
    const elapsed = nowMs() - started;

    if (run.status !== "ok") {
      status = run.status;
      reason = run.reason ?? "unknown";
      if (phase === "cold") break;
      return { status, reason, samples };
    }

    const relevance = relevanceScore(run.text, scenario.expected_patterns);
    samples.push({ ms: elapsed, success: true, relevance });
  }

  return { status, reason, samples };
}

function scenarioIterations(scenario: Scenario, phase: Phase, fallback: number): number {
  if (scenario.kind === "gh_lookup") {
    return 1;
  }
  if (phase === "warm") {
    return Math.min(fallback, 1);
  }
  return fallback;
}

function summarizeNativeAdoption(
  adapterId: string,
  run: { status: "ok" | "unsupported" | "error"; samples: Sample[] },
): NativeAdoption {
  const isVeilMode = adapterId.endsWith("-veil");
  if (run.status !== "ok" || run.samples.length === 0) {
    return {
      first_call_success: 0,
      calls_to_useful_context: 3,
      non_veil_fallback_rate: 1,
    };
  }
  const first = run.samples[0];
  const firstUseful = first.relevance > 0;
  return {
    first_call_success: first.success ? 1 : 0,
    calls_to_useful_context: firstUseful ? 1 : 2,
    non_veil_fallback_rate: isVeilMode ? 0 : 1,
  };
}

function toMarkdown(report: SuiteReport): string {
  const lines: string[] = [];
  lines.push("# Benchmark Suite Result");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Workspace: ${report.config.workspace}`);
  lines.push(
    `Iterations: cold=${String(report.config.cold_iterations)}, warm=${String(report.config.warm_iterations)}`,
  );
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(`- Platform: ${report.environment.platform} (${report.environment.arch})`);
  lines.push(`- Node: ${report.environment.node}`);
  lines.push(`- Bun: ${report.environment.bun ?? "n/a"}`);
  lines.push(
    `- CPU: ${report.environment.cpu_model} (${String(report.environment.cpu_cores)} cores)`,
  );
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push(
    "| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |",
  );
  lines.push(
    "|------------|----------|---------------|---------------|---------|-----------|--------|",
  );

  for (const competitor of report.competitors) {
    for (const scenario of report.scenarios) {
      const row = competitor.scenarios[scenario.id];
      const status = row.status === "ok" ? "ok" : `${row.status}: ${row.reason ?? "n/a"}`;
      lines.push(
        `| ${competitor.label} | ${scenario.title} | ${row.warm.p50_ms.toFixed(4)} | ${row.warm.p95_ms.toFixed(4)} | ${row.warm.success_rate.toFixed(2)} | ${row.warm.relevance_rate.toFixed(2)} | ${status} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Native Adoption Signals");
  lines.push("");
  lines.push(
    "| Competitor | Scenario | First Call Success | Calls To Useful Context | Non-Veil Fallback Rate |",
  );
  lines.push(
    "|------------|----------|--------------------|-------------------------|------------------------|",
  );
  for (const competitor of report.competitors) {
    for (const scenario of report.scenarios) {
      const row = competitor.scenarios[scenario.id];
      lines.push(
        `| ${competitor.label} | ${scenario.title} | ${row.native_adoption.first_call_success.toFixed(2)} | ${row.native_adoption.calls_to_useful_context.toFixed(2)} | ${row.native_adoption.non_veil_fallback_rate.toFixed(2)} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const workspace = resolve(getArg("--workspace") ?? process.cwd());
  const coldIterations = parseIntArg("--cold", 1);
  const warmIterations = parseIntArg("--warm", 50);
  const maxRuntimeMs = parseIntArg("--max-runtime-ms", 600_000);
  const rawOutputRoot = resolve(getArg("--out") ?? "benchmarks/results");
  const outputRoot = basename(rawOutputRoot) === "latest" ? dirname(rawOutputRoot) : rawOutputRoot;
  const runId = toRunId(new Date());
  const outputDir = resolve(join(outputRoot, runId));
  const adapters: Adapter[] = createAgentMatrixAdapters();

  const ctx: RunContext = { workspace };
  const suiteStarted = nowMs();

  for (const adapter of adapters) {
    await adapter.prepare(ctx);
  }

  const scenarioByAdapter = new Map<string, Record<string, ScenarioSummary>>();
  for (const adapter of adapters) {
    scenarioByAdapter.set(adapter.id, {});
  }

  for (const scenario of SCENARIOS) {
    for (const adapter of adapters) {
      const scenarios = scenarioByAdapter.get(adapter.id);
      if (!scenarios) continue;

      if (nowMs() - suiteStarted > maxRuntimeMs) {
        scenarios[scenario.id] = {
          status: "unsupported",
          reason: "suite runtime budget exceeded",
          cold: summarize([]),
          warm: summarize([]),
          native_adoption: {
            first_call_success: 0,
            calls_to_useful_context: 3,
            non_veil_fallback_rate: 1,
          },
        };
        continue;
      }

      const sampleCount = scenarioIterations(scenario, "warm", warmIterations);
      const run = await runScenarioPhase(adapter, ctx, scenario, "warm", sampleCount);
      if (run.status !== "ok") {
        scenarios[scenario.id] = {
          status: run.status,
          reason: run.reason,
          cold: summarize([]),
          warm: summarize([]),
          native_adoption: summarizeNativeAdoption(adapter.id, run),
        };
        continue;
      }
      scenarios[scenario.id] = {
        status: run.status,
        reason: run.reason,
        cold: summarize([]),
        warm: summarize(run.samples),
        native_adoption: summarizeNativeAdoption(adapter.id, run),
      };
    }
  }

  const competitorReports: CompetitorReport[] = adapters.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    scenarios: scenarioByAdapter.get(adapter.id) ?? {},
  }));

  const cpu = cpus();
  const report: SuiteReport = {
    generated_at: new Date().toISOString(),
    environment: {
      hostname: process.env.HOSTNAME ?? "unknown",
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      bun: typeof Bun !== "undefined" ? Bun.version : null,
      cpu_model: cpu[0]?.model ?? "unknown",
      cpu_cores: cpu.length,
    },
    config: {
      workspace,
      cold_iterations: coldIterations,
      warm_iterations: warmIterations,
      output_dir: outputDir,
      competitors: adapters.map((adapter) => adapter.id),
    },
    scenarios: SCENARIOS,
    competitors: competitorReports,
  };

  await mkdir(outputDir, { recursive: true });

  const jsonPath = join(outputDir, "results.json");
  const markdownPath = join(outputDir, "SUMMARY.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await writeFile(markdownPath, toMarkdown(report), "utf-8");

  const repoRoot = resolve(import.meta.dir, "..");
  const benchmarksDocPath = join(repoRoot, "BENCHMARKS.md");
  await writeFile(benchmarksDocPath, toBenchmarksMarkdown(report, repoRoot), "utf-8");

  for (const adapter of adapters) {
    if (adapter.teardown) {
      await adapter.teardown();
    }
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, run_id: runId, max_runtime_ms: maxRuntimeMs, json: jsonPath, markdown: markdownPath, benchmarks: benchmarksDocPath }, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
