import { cpus } from "node:os";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { toBenchmarksMarkdown, toRunId } from "./bench-report";
import { diagnostics } from "./diagnostics";
import { fetchUrl } from "./fetch-url";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
import { buildIndex, discoverIndex, getStatus, lookupIndex, queryChunks, queryFiles, querySymbols } from "./indexer";
import { webSearch } from "./web-search";

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
    ? (): number => Number(Bun.nanoseconds()) / 1_000_000
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
  const stdout = (out.stdout ?? "").trim();
  const stderr = (out.stderr ?? "").trim();

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryTokens(query: string): string[] {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length > 0 ? tokens : [query];
}

function makePrompt(scenario: Scenario, mode: McpMode): string {
  const modeInstruction =
    mode === "none"
      ? "MCP mode is none. Do not use any MCP tools."
      : `MCP mode is ${mode}. Use only ${mode} MCP tools when relevant.`;
  return `${modeInstruction}\nTask: ${scenario.prompt}\nQuery: ${scenario.query}\nReturn concise plain text output.`;
}

function createVeilAdapter(): Adapter {
  return {
    id: "veil",
    label: "Veil MCP index",
    prepare: async (ctx) => {
      const status = await getStatus(ctx.workspace);
      if (!status.exists || status.stale) {
        await buildIndex(ctx.workspace, "changed");
      }
    },
    run: async (ctx, scenario) => {
      try {
        if (scenario.kind === "status") {
          const status = await getStatus(ctx.workspace);
          return { status: "ok", text: JSON.stringify(status) };
        }
        if (scenario.kind === "refresh") {
          const manifest = await buildIndex(ctx.workspace, "changed");
          return { status: "ok", text: JSON.stringify(manifest) };
        }
        if (scenario.kind === "files") {
          const rows = await queryFiles(ctx.workspace, scenario.query, 20);
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "symbols") {
          const rows = await querySymbols(ctx.workspace, scenario.query, 20);
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "search") {
          const rows = await queryChunks(ctx.workspace, scenario.query, 10, { prefer_code: true });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "lookup") {
          const rows = await lookupIndex(ctx.workspace, scenario.query, { prefer_code: true, intent: "code" });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "web_search") {
          const rows = await webSearch(ctx.workspace, { query: scenario.query, limit: 5, timeout_ms: 4_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "fetch_url") {
          const rows = await fetchUrl({ url: scenario.query, format: "markdown", timeout_ms: 4_000, max_bytes: 8_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "diagnostics") {
          const rows = diagnostics.getDiagnostics();
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "git_status") {
          const rows = gitStatus(ctx.workspace, { timeout_ms: 5_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "git_log") {
          const rows = gitLog(ctx.workspace, { limit: 10, timeout_ms: 8_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "git_diff") {
          const rows = gitDiff(ctx.workspace, { staged: false, timeout_ms: 5_000, max_bytes: 100_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "git_show") {
          const rows = gitShow(ctx.workspace, { rev: "HEAD", timeout_ms: 8_000, max_bytes: 100_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        if (scenario.kind === "gh_lookup") {
          const rows = await ghLookup(ctx.workspace, { repo: scenario.query, kind: "repo_context", limit: 3, timeout_ms: 10_000 });
          return { status: "ok", text: JSON.stringify(rows) };
        }
        const rows = await discoverIndex(ctx.workspace, scenario.query, {
          files_limit: 20,
          symbols_limit: 20,
          search_limit: 10,
          prefer_code: true,
        });
        return { status: "ok", text: JSON.stringify(rows) };
      } catch (error) {
        return { status: "error", text: "", reason: String(error) };
      }
    },
  };
}

function createShellAdapter(): Adapter {
  return {
    id: "shell-tools",
    label: "Shell tool workflow",
    prepare: async () => {
      return;
    },
    run: async (ctx, scenario) => {
      if (scenario.kind === "status") {
        const first = runCommand("ls", ["-la"], ctx.workspace);
        const second = runCommand("git", ["status", "--short"], ctx.workspace);
        const third = runCommand("find", [".", "-type", "f"], ctx.workspace);
        if (first.status !== "ok") return first;
        if (second.status !== "ok") return second;
        if (third.status !== "ok") return third;
        return { status: "ok", text: `${first.text}\n${second.text}\n${third.text}`.trim() };
      }

      if (scenario.kind === "refresh") {
        return { status: "unsupported", text: "", reason: "no index refresh equivalent in shell baseline" };
      }

      if (scenario.kind === "files") {
        return runCommand("find", [".", "-type", "f", "-iname", `*${scenario.query}*`], ctx.workspace);
      }

      if (scenario.kind === "symbols") {
        const escaped = escapeRegex(scenario.query);
        return runCommand(
          "rg",
          ["-n", `(function|class|def|const|type|interface).*${escaped}`, ".", "--max-count", "20"],
          ctx.workspace,
          [0, 1],
        );
      }

      if (scenario.kind === "search") {
        return runCommand("rg", ["-n", scenario.query, ".", "--max-count", "10"], ctx.workspace, [0, 1]);
      }

      if (scenario.kind === "lookup") {
        return runCommand("rg", ["-n", "buildIndex", ".", "--max-count", "20"], ctx.workspace, [0, 1]);
      }

      if (scenario.kind === "web_search") {
        return runCommand(
          "curl",
          ["-sL", `https://duckduckgo.com/html/?q=${encodeURIComponent(scenario.query)}`],
          ctx.workspace,
          [0],
        );
      }

      if (scenario.kind === "fetch_url") {
        return runCommand("curl", ["-sL", scenario.query], ctx.workspace, [0]);
      }

      if (scenario.kind === "diagnostics") {
        return { status: "unsupported", text: "", reason: "no equivalent tool in shell baseline" };
      }

      if (scenario.kind === "git_status") {
        return runCommand("git", ["status", "--short", "--branch"], ctx.workspace);
      }

      if (scenario.kind === "git_log") {
        return runCommand("git", ["log", "-n", "10", "--oneline"], ctx.workspace);
      }

      if (scenario.kind === "git_diff") {
        return runCommand("git", ["diff"], ctx.workspace);
      }

      if (scenario.kind === "git_show") {
        return runCommand("git", ["show", "--name-only", "HEAD"], ctx.workspace);
      }

      if (scenario.kind === "gh_lookup") {
        const repoRef = scenario.query;
        const repoName = repoRef.split("/").pop() ?? "repo";
        const target = `/tmp/${repoName}`;
        const clone = runCommand("git", ["clone", "--depth", "1", `https://github.com/${repoRef}.git`, target], ctx.workspace, [0, 128]);
        if (clone.status !== "ok") {
          const fetch = runCommand("git", ["-C", target, "fetch", "--depth", "1", "origin"], ctx.workspace, [0]);
          if (fetch.status !== "ok") return fetch;
        }
        return runCommand("rg", ["-n", "function|class|interface", target, "--max-count", "20"], ctx.workspace, [0, 1]);
      }

      const tokens = queryTokens(scenario.query);
      const findResults: ScenarioRun[] = [];
      const symbolResults: ScenarioRun[] = [];
      for (const token of tokens) {
        const files = runCommand("find", [".", "-type", "f", "-iname", `*${token}*`], ctx.workspace);
        if (files.status !== "ok") return files;
        findResults.push(files);

        const symbols = runCommand(
          "rg",
          ["-n", `(function|class|def|const|type|interface).*${escapeRegex(token)}`, ".", "--max-count", "20"],
          ctx.workspace,
          [0, 1],
        );
        if (symbols.status !== "ok") return symbols;
        symbolResults.push(symbols);
      }

      const code = runCommand("rg", ["-n", tokens.map(escapeRegex).join("|"), ".", "--max-count", "20"], ctx.workspace, [0, 1]);
      if (code.status !== "ok") return code;
      return {
        status: "ok",
        text: [...findResults.map((item) => item.text), ...symbolResults.map((item) => item.text), code.text].join("\n").trim(),
      };
    },
  };
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
    prepare: async (ctx) => {
      const probeCmd = agent;
      const probe = runCommand(probeCmd, ["--help"], ctx.workspace, [0, 1]);
      if (probe.status !== "ok") {
        blockedReason = `${agent} CLI unavailable`;
      }
    },
    run: async (ctx, scenario) => {
      if (blockedReason) {
        return { status: "unsupported", text: "", reason: blockedReason };
      }
      const prompt = makePrompt(scenario, mode);
      const timeoutMs = timeoutForScenario(scenario);

      if (agent === "codex") {
        const base = ["--dangerously-bypass-approvals-and-sandbox"];
        const args = scenario.kind === "web_search" ? [...base, "--search", "exec", prompt] : [...base, "exec", prompt];
        const run = runCommand("codex", args, ctx.workspace, [0], timeoutMs);
        if (run.status === "error" && (run.reason ?? "").includes("ETIMEDOUT")) {
          return { status: "unsupported", text: "", reason: "codex timeout" };
        }
        return run;
      }

      if (agent === "claude") {
        const args = ["-p", "--output-format", "text", "--permission-mode", "bypassPermissions", prompt];
        const run = runCommand("claude", args, ctx.workspace, [0], timeoutMs);
        if (run.status === "error" && (run.reason ?? "").includes("ETIMEDOUT")) {
          return { status: "unsupported", text: "", reason: "claude timeout" };
        }
        return run;
      }

      const args = ["run", "--format", "default", prompt];
      const run = runCommand("opencode", args, ctx.workspace, [0], timeoutMs);
      if (run.status === "error" && (run.reason ?? "").includes("ETIMEDOUT")) {
        return { status: "unsupported", text: "", reason: "opencode timeout" };
      }
      return run;
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

function toMarkdown(report: SuiteReport): string {
  const lines: string[] = [];
  lines.push("# Benchmark Suite Result");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Workspace: ${report.config.workspace}`);
  lines.push(`Iterations: cold=${report.config.cold_iterations}, warm=${report.config.warm_iterations}`);
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(`- Platform: ${report.environment.platform} (${report.environment.arch})`);
  lines.push(`- Node: ${report.environment.node}`);
  lines.push(`- Bun: ${report.environment.bun ?? "n/a"}`);
  lines.push(`- CPU: ${report.environment.cpu_model} (${report.environment.cpu_cores} cores)`);
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push("| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |");
  lines.push("|------------|----------|---------------|---------------|---------|-----------|--------|");

  for (const competitor of report.competitors) {
    for (const scenario of report.scenarios) {
      const row = competitor.scenarios[scenario.id];
      const status = row.status === "ok" ? "ok" : `${row.status}: ${row.reason ?? "n/a"}`;
      lines.push(
        `| ${competitor.label} | ${scenario.title} | ${row.warm.p50_ms.toFixed(4)} | ${row.warm.p95_ms.toFixed(4)} | ${row.warm.success_rate.toFixed(2)} | ${row.warm.relevance_rate.toFixed(2)} | ${status} |`,
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
        };
        continue;
      }
      scenarios[scenario.id] = {
        status: run.status,
        reason: run.reason,
        cold: summarize([]),
        warm: summarize(run.samples),
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

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
