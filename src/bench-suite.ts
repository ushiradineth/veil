import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { callMcpToolOverStdio } from "./bench-mcp-client";
import { toBenchmarksMarkdown, toRunId } from "./bench-report";

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

type AgentId = "veil" | "firecrawl" | "codex" | "claude";
type StrategyId = "mcp_transport";
type ScenarioProfile = "smoke" | "full";
type Phase = "warm";

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
  mode_control: "strict" | "prompt_only";
  prepare: (ctx: RunContext, tracker: ProcessTracker) => Promise<void>;
  run: (
    ctx: RunContext,
    scenario: Scenario,
    tracker: ProcessTracker,
    opts?: { timeoutMs?: number },
  ) => Promise<ScenarioRun>;
  teardown?: () => Promise<void>;
};

type Sample = {
  ms: number;
  success: boolean;
  relevance: number;
};

type NativeAdoption = {
  first_call_success: number;
  calls_to_useful_context: number;
  non_veil_fallback_rate: number;
};

type AbSignal = {
  schema_overhead_tokens: number;
  first_useful_action_ms: number;
  fallback_rate: number;
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

type ScenarioSummary = {
  status: "ok" | "unsupported" | "error";
  reason: string | null;
  cold: Stats;
  warm: Stats;
  native_adoption: NativeAdoption;
  ab_signal: AbSignal;
};

type CompetitorReport = {
  id: string;
  label: string;
  scenarios: Record<string, ScenarioSummary>;
};

type PreflightStatus = {
  ready: boolean;
  mode_control: "strict" | "prompt_only";
  reason: string | null;
};

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
    profile: ScenarioProfile;
    agents: AgentId[];
    strategies: StrategyId[];
    cold_iterations: number;
    warm_iterations: number;
    effective_warm_iterations: number;
    output_dir: string;
    competitors: string[];
    max_runtime_ms: number;
    max_cell_runtime_ms: number;
    preflight: Record<string, PreflightStatus>;
    regression_control_scenario?: string | null;
    regression_confirmation_runs?: number | null;
  };
  scenarios: Scenario[];
  competitors: CompetitorReport[];
};

type ProcessTracker = {
  readonly interrupted: boolean;
  readonly signal: NodeJS.Signals | null;
  track: (child: ChildProcess) => void;
  untrack: (child: ChildProcess) => void;
  abortAll: (signal: NodeJS.Signals) => void;
};

const nowMs =
  typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function"
    ? (): number => Bun.nanoseconds() / 1_000_000
    : (): number => performance.now();

const ALL_SCENARIOS: Scenario[] = [
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

const SMOKE_SCENARIO_IDS = new Set<string>([
  "status-bootstrap",
  "files-homebrew",
  "symbols-build",
  "search-pnpm-install",
  "lookup-build-index",
  "discover-combined",
  "git-status-check",
]);

function showHelp(): void {
  const lines = [
    "Usage: bun run src/bench-suite.ts [options]",
    "",
    "Options:",
    "  --workspace <path>             Workspace root (default: cwd)",
    "  --profile <smoke|full>         Scenario profile (default: smoke)",
    "  --agents <csv>                 Agent set (default: veil,firecrawl)",
    "  --strategies <csv>             Benchmark strategies (default: mcp_transport)",
    "  --modes <csv>                  Legacy alias for --strategies",
    "  --cold <n>                     Cold iteration count metadata (default: 1)",
    "  --warm <n>                     Warm iterations per scenario (default: 1)",
    "  --max-runtime-ms <n>           Whole-suite runtime budget (default: 120000)",
    "  --max-cell-runtime-ms <n>      Per-cell runtime budget (default: 20000)",
    "  --baseline <path>              Optional baseline results.json for regression gate",
    "  --regression-threshold-pct <n> Max allowed p50 regression percent (default: 10)",
    "  --regression-min-warm-samples <n> Minimum warm samples for gate (default: 3 when baseline is set, else 1)",
    "  --regression-control-scenario <id|none> Normalize regression deltas to a control scenario (default: status-bootstrap when baseline is set)",
    "  --regression-confirmation-runs <n> Confirmation attempts when gate fails (default: 2 with baseline, else 1)",
    "  --out <path>                   Output root (default: benchmarks/results)",
    "  -h, --help                     Show this help and exit",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

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

function parseFloatArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseCsvArg(name: string, fallback: string[]): string[] {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parts = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return fallback;
  }
  return Array.from(new Set(parts));
}

function parseAgentIds(raw: string[]): AgentId[] {
  const out: AgentId[] = [];
  for (const item of raw) {
    if (item === "veil" || item === "firecrawl" || item === "codex" || item === "claude") {
      out.push(item);
    }
  }
  return out.length > 0 ? out : ["veil", "firecrawl"];
}

function parseStrategies(raw: string[]): StrategyId[] {
  const out: StrategyId[] = [];
  for (const item of raw) {
    if (item === "mcp_transport" || item === "mcp_baseline") {
      out.push("mcp_transport");
      continue;
    }
    if (item === "veil" || item === "serena") {
      out.push("mcp_transport");
    }
  }
  return out.length > 0 ? Array.from(new Set(out)) : ["mcp_transport"];
}

function parseScenarioProfile(raw: string | undefined): ScenarioProfile {
  if (raw === "full") return "full";
  return "smoke";
}

function scenariosForProfile(profile: ScenarioProfile): Scenario[] {
  if (profile === "full") {
    return ALL_SCENARIOS;
  }
  return ALL_SCENARIOS.filter((scenario) => SMOKE_SCENARIO_IDS.has(scenario.id));
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

function compactReason(reason: string | undefined): string {
  if (!reason) return "unknown";
  const clean = reason.replace(/\s+/g, " ").trim();
  return clean.length <= 120 ? clean : `${clean.slice(0, 117)}...`;
}

function createProcessTracker(): ProcessTracker {
  const children = new Set<ChildProcess>();
  let interrupted = false;
  let signal: NodeJS.Signals | null = null;

  const terminate = (child: ChildProcess, killSignal: NodeJS.Signals): void => {
    const pid = child.pid;
    if (!pid || child.killed) return;
    if (process.platform !== "win32") {
      try {
        process.kill(-pid, killSignal);
        return;
      } catch {
        // fallback below
      }
    }
    try {
      child.kill(killSignal);
    } catch {
      // ignore kill races
    }
  };

  return {
    get interrupted(): boolean {
      return interrupted;
    },
    get signal(): NodeJS.Signals | null {
      return signal;
    },
    track: (child) => {
      children.add(child);
    },
    untrack: (child) => {
      children.delete(child);
    },
    abortAll: (nextSignal) => {
      interrupted = true;
      signal = nextSignal;
      for (const child of children) {
        terminate(child, "SIGTERM");
        setTimeout(() => {
          terminate(child, "SIGKILL");
        }, 1_500);
      }
    },
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  tracker: ProcessTracker,
  allowedExitCodes: number[] = [0],
  timeoutMs = 30_000,
): Promise<ScenarioRun> {
  if (tracker.interrupted) {
    return {
      status: "unsupported",
      text: "",
      reason: `interrupted by ${tracker.signal ?? "signal"}`,
    };
  }

  return await new Promise<ScenarioRun>((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    tracker.track(child);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const terminate = (killSignal: NodeJS.Signals): void => {
      const pid = child.pid;
      if (!pid || child.killed) return;
      if (process.platform !== "win32") {
        try {
          process.kill(-pid, killSignal);
          return;
        } catch {
          // fallback below
        }
      }
      try {
        child.kill(killSignal);
      } catch {
        // ignore kill races
      }
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      terminate("SIGTERM");
      setTimeout(() => {
        terminate("SIGKILL");
      }, 1_500);
    }, timeoutMs);

    const finish = (result: ScenarioRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      tracker.untrack(child);
      resolveRun(result);
    };

    child.on("error", (error) => {
      finish({
        status: "error",
        text: `${stdout.trim()}\n${stderr.trim()}`.trim(),
        reason: error.message,
      });
    });

    child.on("close", (code) => {
      const out = `${stdout.trim()}\n${stderr.trim()}`.trim();
      if (tracker.interrupted) {
        finish({
          status: "unsupported",
          text: out,
          reason: `interrupted by ${tracker.signal ?? "signal"}`,
        });
        return;
      }
      if (timedOut) {
        finish({
          status: "error",
          text: out,
          reason: `ETIMEDOUT after ${String(timeoutMs)}ms`,
        });
        return;
      }
      if (!allowedExitCodes.includes(code ?? -1)) {
        const detail = stderr.trim().length > 0 ? `: ${stderr.trim().slice(0, 200)}` : "";
        finish({
          status: "error",
          text: out,
          reason: `exit status ${String(code)}${detail}`,
        });
        return;
      }
      finish({ status: "ok", text: out });
    });
  });
}

function timeoutForScenario(scenario: Scenario): number {
  if (scenario.kind === "gh_lookup") return 45_000;
  if (scenario.kind === "web_search" || scenario.kind === "fetch_url") return 30_000;
  return 15_000;
}

function strategySchemaOverhead(): number {
  return 12_000;
}

type McpToolCall = { toolName: string; args: Record<string, unknown> };

function veilMcpCallForScenario(workspace: string, scenario: Scenario): McpToolCall | null {
  switch (scenario.kind) {
    case "status":
      return { toolName: "veil_status", args: { workspace } };
    case "refresh":
      return { toolName: "veil_refresh", args: { workspace, mode: "changed" } };
    case "files":
      return {
        toolName: "veil_files",
        args: { workspace, query: scenario.query, limit: 20 },
      };
    case "symbols":
      return {
        toolName: "veil_symbols",
        args: { workspace, query: scenario.query, limit: 20 },
      };
    case "search":
      return {
        toolName: "veil_search",
        args: {
          workspace,
          query: scenario.query,
          limit: 10,
          prefer_code: true,
        },
      };
    case "lookup":
      return {
        toolName: "veil_lookup",
        args: { workspace, query: scenario.query },
      };
    case "discover":
      return {
        toolName: "veil_discover",
        args: { workspace, query: scenario.query },
      };
    case "web_search":
      return {
        toolName: "veil_web_search",
        args: { workspace, query: scenario.query, limit: 5 },
      };
    case "fetch_url":
      return {
        toolName: "veil_fetch_url",
        args: { url: scenario.query, format: "markdown" },
      };
    case "diagnostics":
      return { toolName: "veil_diagnostics", args: {} };
    case "git_status":
      return { toolName: "veil_git_status", args: { workspace } };
    case "git_log":
      return { toolName: "veil_git_log", args: { workspace, limit: 10 } };
    case "git_diff":
      return { toolName: "veil_git_diff", args: { workspace } };
    case "git_show":
      return { toolName: "veil_git_show", args: { workspace, rev: "HEAD" } };
    case "gh_lookup":
      return {
        toolName: "veil_gh_lookup",
        args: {
          workspace,
          repo: scenario.query,
          kind: "repo_context",
          limit: 1,
        },
      };
    default:
      return null;
  }
}

function firecrawlMcpCallForScenario(scenario: Scenario): McpToolCall | null {
  if (scenario.kind === "web_search") {
    return {
      toolName: "firecrawl_search",
      args: { query: scenario.query, limit: 3 },
    };
  }
  if (scenario.kind === "fetch_url") {
    return {
      toolName: "firecrawl_scrape",
      args: {
        url: scenario.query,
        formats: ["markdown"],
        onlyMainContent: true,
      },
    };
  }
  return null;
}

async function preflightAgent(
  agent: AgentId,
  workspace: string,
  tracker: ProcessTracker,
): Promise<PreflightStatus> {
  if (agent === "veil") {
    return {
      ready: true,
      mode_control: "strict",
      reason: "local veil MCP stdio transport",
    };
  }

  if (agent === "firecrawl") {
    const status = await runCommand("firecrawl", ["--status"], workspace, tracker, [0], 10_000);
    if (status.status !== "ok") {
      return {
        ready: false,
        mode_control: "strict",
        reason: "firecrawl unavailable: " + compactReason(status.reason),
      };
    }

    return {
      ready: true,
      mode_control: "strict",
      reason: "firecrawl MCP strategy via local command execution",
    };
  }

  return {
    ready: false,
    mode_control: "strict",
    reason: agent + " does not expose controllable MCP transport mode",
  };
}

function createAgentAdapter(
  agent: AgentId,
  strategy: StrategyId,
  preflight: PreflightStatus,
): Adapter {
  const id = `${agent}-${strategy}`;
  const label = `${agent} (${strategy})`;
  let blockedReason: string | null = !preflight.ready ? preflight.reason : null;

  return {
    id,
    label,
    mode_control: preflight.mode_control,
    prepare: async (ctx, tracker) => {
      if (blockedReason) return;
      if (agent === "firecrawl") {
        const probe = await runCommand(
          "firecrawl",
          ["--version"],
          ctx.workspace,
          tracker,
          [0],
          8_000,
        );
        if (probe.status !== "ok") {
          blockedReason = "firecrawl unavailable: " + compactReason(probe.reason);
        }
        return;
      }
      if (agent === "veil") return;
      const probe = await runCommand(agent, ["--help"], ctx.workspace, tracker, [0, 1], 8_000);
      if (probe.status !== "ok") {
        blockedReason = agent + " unavailable: " + compactReason(probe.reason);
      }
    },
    run: async (ctx, scenario, tracker, opts) => {
      if (blockedReason) {
        return { status: "unsupported", text: "", reason: blockedReason };
      }
      const timeoutMs = opts?.timeoutMs ?? timeoutForScenario(scenario);

      if (agent === "veil") {
        const call = veilMcpCallForScenario(ctx.workspace, scenario);
        if (!call) {
          return {
            status: "unsupported",
            text: "",
            reason: "scenario not mapped for veil MCP",
          };
        }
        return await callMcpToolOverStdio(
          {
            command: "nix",
            args: ["run", "nixpkgs#bun", "--", "run", "src/bin.ts"],
            cwd: ctx.workspace,
          },
          call.toolName,
          call.args,
          timeoutMs,
        );
      }

      if (agent === "firecrawl") {
        if (strategy === "mcp_transport") {
          const call = firecrawlMcpCallForScenario(scenario);
          if (!call) {
            return {
              status: "unsupported",
              text: "",
              reason: "scenario not mapped for firecrawl MCP competitor",
            };
          }
          const env: Record<string, string> = {};
          if (process.env.FIRECRAWL_API_KEY) {
            env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
          }
          return await callMcpToolOverStdio(
            {
              command: "npx",
              args: ["-y", "firecrawl-mcp"],
              cwd: ctx.workspace,
              env,
            },
            call.toolName,
            call.args,
            timeoutMs,
          );
        }

        return {
          status: "unsupported",
          text: "",
          reason: agent + " mcp_transport is unsupported",
        };
      }

      return {
        status: "unsupported",
        text: "",
        reason: agent + " mcp_transport is unsupported",
      };
    },
  };
}

async function createAgentMatrixAdapters(
  workspace: string,
  agents: AgentId[],
  strategies: StrategyId[],
  tracker: ProcessTracker,
): Promise<{
  adapters: Adapter[];
  preflight: Record<string, PreflightStatus>;
}> {
  const adapters: Adapter[] = [];
  const preflight: Record<string, PreflightStatus> = {};
  for (const agent of agents) {
    for (const strategy of strategies) {
      const id = `${agent}-${strategy}`;
      const status = await preflightAgent(agent, workspace, tracker);
      preflight[id] = status;
      adapters.push(createAgentAdapter(agent, strategy, status));
    }
  }
  return { adapters, preflight };
}

async function runScenarioPhase(
  adapter: Adapter,
  ctx: RunContext,
  scenario: Scenario,
  phase: Phase,
  iterations: number,
  maxCellRuntimeMs: number,
  tracker: ProcessTracker,
): Promise<{
  status: "ok" | "unsupported" | "error";
  reason: string | null;
  samples: Sample[];
}> {
  const samples: Sample[] = [];
  const startedPhase = nowMs();
  let status: "ok" | "unsupported" | "error" = "ok";
  let reason: string | null = null;

  for (let i = 0; i < iterations; i += 1) {
    const elapsedCell = nowMs() - startedPhase;
    const remaining = Math.floor(maxCellRuntimeMs - elapsedCell);
    if (remaining <= 0) {
      return {
        status: "unsupported",
        reason: "cell runtime budget exceeded",
        samples,
      };
    }

    const started = nowMs();
    const timeoutMs = Math.max(1_000, Math.min(timeoutForScenario(scenario), remaining));
    const run = await adapter.run(ctx, scenario, tracker, { timeoutMs });
    const elapsed = nowMs() - started;

    if (run.status !== "ok") {
      status = run.status;
      reason = run.reason ?? "unknown";
      return { status, reason, samples };
    }

    const relevance = relevanceScore(run.text, scenario.expected_patterns);
    samples.push({ ms: elapsed, success: true, relevance });

    if (tracker.interrupted) {
      return {
        status: "unsupported",
        reason: `interrupted by ${tracker.signal ?? "signal"}`,
        samples,
      };
    }
  }

  return { status, reason, samples };
}

function scenarioIterations(scenario: Scenario, fallback: number): number {
  if (scenario.kind === "gh_lookup") {
    return 1;
  }
  return Math.max(1, fallback);
}

function summarizeNativeAdoption(
  adapterId: string,
  run: { status: "ok" | "unsupported" | "error"; samples: Sample[] },
): NativeAdoption {
  const isVeil = adapterId.startsWith("veil-");
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
    non_veil_fallback_rate: isVeil ? 0 : 1,
  };
}

function summarizeAbSignal(
  adapterId: string,
  run: { status: "ok" | "unsupported" | "error"; samples: Sample[] },
  nativeAdoption: NativeAdoption,
): AbSignal {
  let firstUsefulActionMs = 0;
  for (const sample of run.samples) {
    if (sample.relevance > 0) {
      firstUsefulActionMs = Number(sample.ms.toFixed(4));
      break;
    }
  }
  return {
    schema_overhead_tokens: strategySchemaOverhead(),
    first_useful_action_ms: firstUsefulActionMs,
    fallback_rate: nativeAdoption.non_veil_fallback_rate,
  };
}

type RegressionGateResult = {
  compared: number;
  violations: string[];
  insufficient_samples: string[];
  warnings: string[];
};

type RegressionGateOptions = {
  minWarmSamples: number;
  normalizeByScenarioId: string | null;
};

function requiredMinWarmSamples(scenario: Scenario, configuredMin: number): number {
  if (scenario.kind === "gh_lookup") return 1;
  return Math.max(1, configuredMin);
}

function evaluateRegressionGate(
  current: SuiteReport,
  baseline: SuiteReport,
  thresholdPct: number,
  options: RegressionGateOptions,
): RegressionGateResult {
  const baselineByCompetitor = new Map<string, CompetitorReport>();
  for (const competitor of baseline.competitors) {
    baselineByCompetitor.set(competitor.id, competitor);
  }

  let compared = 0;
  const violations: string[] = [];
  const insufficientSamples: string[] = [];
  const warnings: string[] = [];
  for (const competitor of current.competitors) {
    if (!competitor.id.startsWith("veil-")) continue;
    const baselineCompetitor = baselineByCompetitor.get(competitor.id);
    if (!baselineCompetitor) continue;
    const controlScenario = options.normalizeByScenarioId;
    let baselineControlP50: number | null = null;
    let currentControlP50: number | null = null;
    let controlApplied = false;
    if (controlScenario) {
      const controlScenarioDef = current.scenarios.find((entry) => entry.id === controlScenario);
      const controlMinSamples = controlScenarioDef
        ? requiredMinWarmSamples(controlScenarioDef, options.minWarmSamples)
        : options.minWarmSamples;
      const baselineControl = baselineCompetitor.scenarios[controlScenario] as
        | ScenarioSummary
        | undefined;
      const currentControl = competitor.scenarios[controlScenario] as ScenarioSummary | undefined;
      if (
        baselineControl &&
        currentControl &&
        baselineControl.status === "ok" &&
        currentControl.status === "ok" &&
        baselineControl.warm.count >= controlMinSamples &&
        currentControl.warm.count >= controlMinSamples &&
        Number.isFinite(baselineControl.warm.p50_ms) &&
        Number.isFinite(currentControl.warm.p50_ms) &&
        baselineControl.warm.p50_ms > 0 &&
        currentControl.warm.p50_ms > 0
      ) {
        baselineControlP50 = baselineControl.warm.p50_ms;
        currentControlP50 = currentControl.warm.p50_ms;
        controlApplied = true;
      } else {
        warnings.push(
          `${competitor.id}: normalization-control-unavailable (${controlScenario}, min=${String(controlMinSamples)})`,
        );
      }
    }
    for (const scenario of current.scenarios) {
      const row = competitor.scenarios[scenario.id] as ScenarioSummary | undefined;
      const baselineRow = baselineCompetitor.scenarios[scenario.id] as ScenarioSummary | undefined;
      if (!row || !baselineRow) continue;
      if (row.status !== "ok" || baselineRow.status !== "ok") continue;
      const currentCount = row.warm.count;
      const baselineCount = baselineRow.warm.count;
      const requiredSamples = requiredMinWarmSamples(scenario, options.minWarmSamples);
      if (currentCount < requiredSamples || baselineCount < requiredSamples) {
        insufficientSamples.push(
          `${competitor.id}:${scenario.id} (current=${String(currentCount)}, baseline=${String(baselineCount)}, min=${String(requiredSamples)})`,
        );
        continue;
      }
      const baselineP50 = baselineRow.warm.p50_ms;
      if (!Number.isFinite(baselineP50) || baselineP50 <= 0) continue;
      const rawCurrentP50 = row.warm.p50_ms;
      const rawCurrentP95 =
        Number.isFinite(row.warm.p95_ms) && row.warm.p95_ms > 0 ? row.warm.p95_ms : rawCurrentP50;
      const isControlScenario = controlScenario !== null && scenario.id === controlScenario;
      const normalizationRatio =
        !isControlScenario && controlApplied && baselineControlP50 && currentControlP50
          ? baselineControlP50 / currentControlP50
          : null;
      const currentP50 =
        normalizationRatio !== null ? rawCurrentP50 * normalizationRatio : rawCurrentP50;
      const baselineP95 =
        Number.isFinite(baselineRow.warm.p95_ms) && baselineRow.warm.p95_ms > 0
          ? baselineRow.warm.p95_ms
          : baselineP50;
      const baselineP99 =
        Number.isFinite(baselineRow.warm.p99_ms) && baselineRow.warm.p99_ms > 0
          ? baselineRow.warm.p99_ms
          : baselineP95;
      const rawCurrentP99 =
        Number.isFinite(row.warm.p99_ms) && row.warm.p99_ms > 0 ? row.warm.p99_ms : rawCurrentP95;
      const currentP99 =
        normalizationRatio !== null ? rawCurrentP99 * normalizationRatio : rawCurrentP99;
      const baselineSpreadMs = Math.max(0, baselineP99 - baselineP50);
      const currentSpreadMs = Math.max(0, currentP99 - currentP50);
      const deltaMs = currentP50 - baselineP50;
      const thresholdMs = baselineP50 * (thresholdPct / 100);
      const stabilityBandMs = Math.max(thresholdMs, (baselineSpreadMs + currentSpreadMs) / 2);
      const deltaPct = ((currentP50 - baselineP50) / baselineP50) * 100;
      compared += 1;
      if (deltaMs > stabilityBandMs) {
        violations.push(
          `${competitor.id}:${scenario.id} ${deltaPct.toFixed(2)}% (${currentP50.toFixed(4)} vs ${baselineP50.toFixed(4)}, band_ms=${stabilityBandMs.toFixed(4)}, raw=${rawCurrentP50.toFixed(4)})`,
        );
      }
    }
  }
  return {
    compared,
    violations,
    insufficient_samples: insufficientSamples,
    warnings: Array.from(new Set(warnings)),
  };
}

function gateFailureMessage(gateResult: RegressionGateResult | null): string | null {
  if (!gateResult) return null;
  if (gateResult.insufficient_samples.length > 0) {
    return (
      "benchmark-regression-gate-insufficient-samples: " +
      gateResult.insufficient_samples.join("; ")
    );
  }
  if (gateResult.violations.length > 0) {
    return "benchmark-regression-gate-failed: " + gateResult.violations.join("; ");
  }
  return null;
}

function toMarkdown(report: SuiteReport): string {
  const lines: string[] = [];
  lines.push("# Benchmark Suite Result");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Workspace: ${report.config.workspace}`);
  lines.push(`Profile: ${report.config.profile}`);
  lines.push(`Agents: ${report.config.agents.join(",")}`);
  lines.push(`Strategies: ${report.config.strategies.join(",")}`);
  lines.push(`Runtime budget: ${String(report.config.max_runtime_ms)}ms`);
  lines.push(`Cell budget: ${String(report.config.max_cell_runtime_ms)}ms`);
  lines.push(
    `Iterations: cold=${String(report.config.cold_iterations)}, warm=${String(report.config.warm_iterations)}${
      report.config.effective_warm_iterations !== report.config.warm_iterations
        ? ` (effective ${String(report.config.effective_warm_iterations)})`
        : ""
    }`,
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
  lines.push("## Preflight");
  lines.push("");
  lines.push("| Competitor | Ready | Mode Control | Reason |");
  lines.push("|------------|-------|--------------|--------|");
  for (const competitor of report.competitors) {
    const pre = report.config.preflight[competitor.id];
    const ready = pre.ready ? "yes" : "no";
    const mode = pre.mode_control;
    const reason = pre.reason ?? "";
    lines.push(`| ${competitor.label} | ${ready} | ${mode} | ${reason} |`);
  }

  lines.push("");
  lines.push("## A/B Signals");
  lines.push("");
  lines.push(
    "| Competitor | Scenario | Schema Overhead (tokens) | First Useful Action (ms) | Fallback Rate |",
  );
  lines.push(
    "|------------|----------|---------------------------|--------------------------|---------------|",
  );
  for (const competitor of report.competitors) {
    for (const scenario of report.scenarios) {
      const row = competitor.scenarios[scenario.id];
      lines.push(
        `| ${competitor.label} | ${scenario.title} | ${row.ab_signal.schema_overhead_tokens.toFixed(0)} | ${row.ab_signal.first_useful_action_ms.toFixed(4)} | ${row.ab_signal.fallback_rate.toFixed(2)} |`,
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
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const workspace = resolve(getArg("--workspace") ?? process.cwd());
  const profile = parseScenarioProfile(getArg("--profile"));
  const agents = parseAgentIds(parseCsvArg("--agents", ["veil", "firecrawl"]));
  const strategies = parseStrategies(
    parseCsvArg("--strategies", parseCsvArg("--modes", ["mcp_transport"])),
  );
  const scenarios = scenariosForProfile(profile);

  const coldIterations = parseIntArg("--cold", 1);
  const warmIterations = parseIntArg("--warm", 1);
  const maxRuntimeMs = parseIntArg("--max-runtime-ms", 120_000);
  const maxCellRuntimeMs = parseIntArg("--max-cell-runtime-ms", 20_000);
  const baselinePath = getArg("--baseline");
  const regressionThresholdPct = parseFloatArg("--regression-threshold-pct", 10);
  const regressionMinWarmSamples = parseIntArg(
    "--regression-min-warm-samples",
    baselinePath ? 3 : 1,
  );
  const regressionConfirmationRuns = parseIntArg(
    "--regression-confirmation-runs",
    baselinePath ? 2 : 1,
  );
  const effectiveWarmIterations = Math.max(
    warmIterations,
    baselinePath ? regressionMinWarmSamples : 1,
  );
  const regressionControlScenarioRaw = getArg(
    "--regression-control-scenario",
    baselinePath ? "status-bootstrap" : undefined,
  );
  const regressionControlScenario =
    regressionControlScenarioRaw && regressionControlScenarioRaw !== "none"
      ? regressionControlScenarioRaw
      : null;
  if (
    regressionControlScenario &&
    !scenarios.some((scenario) => scenario.id === regressionControlScenario)
  ) {
    throw new Error(`invalid-regression-control-scenario: ${regressionControlScenario}`);
  }
  const rawOutputRoot = resolve(getArg("--out") ?? "benchmarks/results");
  const outputRoot = basename(rawOutputRoot) === "latest" ? dirname(rawOutputRoot) : rawOutputRoot;
  const runId = toRunId(new Date());
  const outputDir = resolve(join(outputRoot, runId));

  const tracker = createProcessTracker();
  const onSigint = (): void => {
    tracker.abortAll("SIGINT");
  };
  const onSigterm = (): void => {
    tracker.abortAll("SIGTERM");
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  const ctx: RunContext = { workspace };
  const matrix = await createAgentMatrixAdapters(workspace, agents, strategies, tracker);
  const adapters: Adapter[] = matrix.adapters;

  try {
    for (const adapter of adapters) {
      await adapter.prepare(ctx, tracker);
    }

    const runScenarioMatrix = async (): Promise<CompetitorReport[]> => {
      const scenarioByAdapter = new Map<string, Record<string, ScenarioSummary>>();
      for (const adapter of adapters) {
        scenarioByAdapter.set(adapter.id, {});
      }
      const suiteAttemptStarted = nowMs();

      for (const scenario of scenarios) {
        for (const adapter of adapters) {
          const rows = scenarioByAdapter.get(adapter.id);
          if (!rows) continue;

          if (tracker.interrupted) {
            const nativeAdoption = {
              first_call_success: 0,
              calls_to_useful_context: 3,
              non_veil_fallback_rate: 1,
            };
            rows[scenario.id] = {
              status: "unsupported",
              reason: `interrupted by ${tracker.signal ?? "signal"}`,
              cold: summarize([]),
              warm: summarize([]),
              native_adoption: nativeAdoption,
              ab_signal: summarizeAbSignal(
                adapter.id,
                { status: "unsupported", samples: [] },
                nativeAdoption,
              ),
            };
            continue;
          }

          if (nowMs() - suiteAttemptStarted > maxRuntimeMs) {
            const nativeAdoption = {
              first_call_success: 0,
              calls_to_useful_context: 3,
              non_veil_fallback_rate: 1,
            };
            rows[scenario.id] = {
              status: "unsupported",
              reason: "suite runtime budget exceeded",
              cold: summarize([]),
              warm: summarize([]),
              native_adoption: nativeAdoption,
              ab_signal: summarizeAbSignal(
                adapter.id,
                { status: "unsupported", samples: [] },
                nativeAdoption,
              ),
            };
            continue;
          }

          const minWarmForScenario = baselinePath
            ? requiredMinWarmSamples(scenario, regressionMinWarmSamples)
            : 1;
          const sampleCount = scenarioIterations(
            scenario,
            Math.max(warmIterations, minWarmForScenario),
          );
          const run = await runScenarioPhase(
            adapter,
            ctx,
            scenario,
            "warm",
            sampleCount,
            maxCellRuntimeMs,
            tracker,
          );
          if (run.status !== "ok") {
            const nativeAdoption = summarizeNativeAdoption(adapter.id, run);
            rows[scenario.id] = {
              status: run.status,
              reason: run.reason,
              cold: summarize([]),
              warm: summarize(run.samples),
              native_adoption: nativeAdoption,
              ab_signal: summarizeAbSignal(adapter.id, run, nativeAdoption),
            };
            continue;
          }

          const nativeAdoption = summarizeNativeAdoption(adapter.id, run);
          rows[scenario.id] = {
            status: "ok",
            reason: null,
            cold: summarize([]),
            warm: summarize(run.samples),
            native_adoption: nativeAdoption,
            ab_signal: summarizeAbSignal(adapter.id, run, nativeAdoption),
          };
        }
      }

      return adapters.map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        scenarios: scenarioByAdapter.get(adapter.id) ?? {},
      }));
    };

    const buildReport = (competitorReports: CompetitorReport[]): SuiteReport => ({
      generated_at: new Date().toISOString(),
      environment: {
        hostname: process.env.HOSTNAME ?? "unknown",
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        bun: typeof Bun !== "undefined" ? Bun.version : null,
        cpu_model: cpus()[0]?.model ?? "unknown",
        cpu_cores: cpus().length,
      },
      config: {
        workspace,
        profile,
        agents,
        strategies,
        cold_iterations: coldIterations,
        warm_iterations: warmIterations,
        effective_warm_iterations: effectiveWarmIterations,
        output_dir: outputDir,
        competitors: adapters.map((adapter) => adapter.id),
        max_runtime_ms: maxRuntimeMs,
        max_cell_runtime_ms: maxCellRuntimeMs,
        preflight: matrix.preflight,
        regression_control_scenario: regressionControlScenario,
        regression_confirmation_runs: baselinePath ? regressionConfirmationRuns : null,
      },
      scenarios,
      competitors: competitorReports,
    });

    const competitorReports = await runScenarioMatrix();

    const report = buildReport(competitorReports);

    const regressionGate = baselinePath
      ? (() => {
          const baselineAbs = resolve(baselinePath);
          return { baselineAbs, thresholdPct: regressionThresholdPct };
        })()
      : null;

    let gateResult: RegressionGateResult | null = null;
    let regressionConfirmationFailures: number | null = null;
    if (regressionGate) {
      const baselineRaw = await readFile(regressionGate.baselineAbs, "utf-8");
      const baseline = JSON.parse(baselineRaw) as SuiteReport;
      gateResult = evaluateRegressionGate(report, baseline, regressionGate.thresholdPct, {
        minWarmSamples: regressionMinWarmSamples,
        normalizeByScenarioId: regressionControlScenario,
      });

      let gateFailure = gateFailureMessage(gateResult);
      let failures = gateFailure ? 1 : 0;
      let stableGateResult = gateResult;

      if (gateFailure && regressionConfirmationRuns > 1) {
        for (let attempt = 2; attempt <= regressionConfirmationRuns; attempt += 1) {
          const attemptReport = buildReport(await runScenarioMatrix());
          const attemptGate = evaluateRegressionGate(
            attemptReport,
            baseline,
            regressionGate.thresholdPct,
            {
              minWarmSamples: regressionMinWarmSamples,
              normalizeByScenarioId: regressionControlScenario,
            },
          );
          const attemptFailure = gateFailureMessage(attemptGate);
          if (attemptFailure) {
            failures += 1;
          } else {
            gateFailure = null;
            stableGateResult = attemptGate;
          }
        }

        if (failures < regressionConfirmationRuns) {
          const warnings = [
            ...(stableGateResult?.warnings ?? []),
            `regression-gate-unstable: ${String(failures)}/${String(regressionConfirmationRuns)} attempts failed`,
          ];
          stableGateResult = {
            ...(stableGateResult ?? {
              compared: 0,
              violations: [],
              insufficient_samples: [],
              warnings: [],
            }),
            warnings: Array.from(new Set(warnings)),
          };
        }
      }

      gateResult = stableGateResult;
      regressionConfirmationFailures = failures;
    }

    await mkdir(outputDir, { recursive: true });

    const jsonPath = join(outputDir, "results.json");
    const markdownPath = join(outputDir, "SUMMARY.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    await writeFile(markdownPath, toMarkdown(report), "utf-8");

    const repoRoot = resolve(import.meta.dir, "..");
    const benchmarksDocPath = join(repoRoot, "BENCHMARKS.md");
    await writeFile(benchmarksDocPath, toBenchmarksMarkdown(report, repoRoot), "utf-8");

    const gateFailure = gateFailureMessage(gateResult);

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: gateFailure === null,
          run_id: runId,
          profile,
          agents,
          strategies,
          max_runtime_ms: maxRuntimeMs,
          max_cell_runtime_ms: maxCellRuntimeMs,
          regression_min_warm_samples: regressionGate ? regressionMinWarmSamples : null,
          regression_control_scenario: regressionGate ? regressionControlScenario : null,
          regression_confirmation_runs: regressionGate ? regressionConfirmationRuns : null,
          regression_confirmation_failures: regressionGate ? regressionConfirmationFailures : null,
          baseline: regressionGate?.baselineAbs ?? null,
          regression_threshold_pct: regressionGate?.thresholdPct ?? null,
          regression_gate: gateResult,
          json: jsonPath,
          markdown: markdownPath,
          benchmarks: benchmarksDocPath,
          error: gateFailure,
        },
        null,
        2,
      )}\n`,
    );

    if (gateFailure) {
      throw new Error(gateFailure);
    }
  } finally {
    for (const adapter of adapters) {
      if (adapter.teardown) {
        await adapter.teardown();
      }
    }
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

export const __internalBenchSuite = {
  parseAgentIds,
  parseStrategies,
  parseScenarioProfile,
  scenariosForProfile,
  evaluateRegressionGate,
};

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
