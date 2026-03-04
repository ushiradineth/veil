import { cpus } from "node:os";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildIndex, discoverIndex, getStatus, queryChunks, queryFiles, querySymbols } from "./indexer";

type Phase = "cold" | "warm";
type ScenarioKind = "status" | "files" | "symbols" | "search" | "discover";

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

type ExternalCommandConfig = {
  name: string;
  commands: Partial<Record<ScenarioKind, string[]>>;
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
    id: "discover-combined",
    kind: "discover",
    title: "Combined discovery workflow",
    prompt: "Find files, symbols, and code for homebrew pnpm build",
    query: "homebrew pnpm build",
    expected_patterns: ["homebrew", "pnpm", "build"],
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

function runCommand(command: string, args: string[], cwd: string): ScenarioRun {
  const out = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 30_000,
  });
  const stdout = (out.stdout ?? "").trim();
  const stderr = (out.stderr ?? "").trim();

  if (out.error) {
    return { status: "error", text: `${stdout}\n${stderr}`.trim(), reason: out.error.message };
  }

  if (out.status !== 0 && out.status !== 1) {
    return {
      status: "error",
      text: `${stdout}\n${stderr}`.trim(),
      reason: `exit status ${String(out.status)}`,
    };
  }

  return {
    status: "ok",
    text: `${stdout}\n${stderr}`.trim(),
  };
}

function replaceTemplate(raw: string, values: Record<string, string>): string {
  let out = raw;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

async function loadExternalCommandConfig(filePath?: string): Promise<ExternalCommandConfig | null> {
  if (!filePath) return null;
  const absolute = resolve(filePath);
  const content = await readFile(absolute, "utf-8");
  return JSON.parse(content) as ExternalCommandConfig;
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
    label: "Shell tool workflow (Claude/Codex baseline)",
    prepare: async () => {
      return;
    },
    run: async (ctx, scenario) => {
      if (scenario.kind === "status") {
        const first = runCommand("git", ["status", "--short"], ctx.workspace);
        const second = runCommand("find", [".", "-type", "f"], ctx.workspace);
        if (first.status !== "ok") return first;
        if (second.status !== "ok") return second;
        return { status: "ok", text: `${first.text}\n${second.text}`.trim() };
      }

      if (scenario.kind === "files") {
        return runCommand("find", [".", "-type", "f", "-iname", `*${scenario.query}*`], ctx.workspace);
      }

      if (scenario.kind === "symbols") {
        return runCommand("rg", ["-n", "(function|class|def|const|type|interface).*build", "."], ctx.workspace);
      }

      if (scenario.kind === "search") {
        return runCommand("rg", ["-n", scenario.query, ".", "--max-count", "10"], ctx.workspace);
      }

      const files = runCommand("find", [".", "-type", "f", "-iname", "*homebrew*", "-o", "-iname", "*pnpm*"], ctx.workspace);
      const symbolsA = runCommand("rg", ["-n", "(function|class|def|const|type|interface).*homebrew", ".", "--max-count", "20"], ctx.workspace);
      const symbolsB = runCommand("rg", ["-n", "(function|class|def|const|type|interface).*pnpm", ".", "--max-count", "20"], ctx.workspace);
      const code = runCommand("rg", ["-n", "homebrew|pnpm|build", ".", "--max-count", "20"], ctx.workspace);
      if (files.status !== "ok") return files;
      if (symbolsA.status !== "ok") return symbolsA;
      if (symbolsB.status !== "ok") return symbolsB;
      if (code.status !== "ok") return code;
      return {
        status: "ok",
        text: `${files.text}\n${symbolsA.text}\n${symbolsB.text}\n${code.text}`.trim(),
      };
    },
  };
}

function extractToolText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as { content?: Array<{ type?: string; text?: string }> };
  const chunks = record.content ?? [];
  const texts = chunks
    .filter((chunk) => chunk.type === "text" && typeof chunk.text === "string")
    .map((chunk) => chunk.text ?? "");
  return texts.join("\n");
}

function createSerenaAdapter(config: ExternalCommandConfig | null): Adapter {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;
  let blockedReason: string | null = null;

  const fromConfig = (kind: ScenarioKind, workspace: string, query: string): ScenarioRun | null => {
    if (!config) return null;
    const commandSpec = config.commands[kind];
    if (!commandSpec || commandSpec.length === 0) {
      return {
        status: "unsupported",
        text: "",
        reason: `missing command for scenario kind '${kind}'`,
      };
    }
    const rendered = commandSpec.map((entry) => replaceTemplate(entry, { workspace, query }));
    const [command, ...args] = rendered;
    if (!command) {
      return {
        status: "unsupported",
        text: "",
        reason: "empty command",
      };
    }
    return runCommand(command, args, workspace);
  };

  return {
    id: "serena",
    label: "Serena",
    prepare: async (ctx) => {
      if (config) return;

      try {
        const probe = runCommand("uvx", ["--help"], ctx.workspace);
        if (probe.status !== "ok") {
          blockedReason = "uvx not available";
          return;
        }

        client = new Client({ name: "veil-bench", version: "0.1.0" }, { capabilities: {} });
        transport = new StdioClientTransport({
          command: "uvx",
          args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"],
          cwd: ctx.workspace,
          stderr: "pipe",
        });
        await client.connect(transport);
        await client.callTool({ name: "activate_project", arguments: { project: ctx.workspace } });
      } catch (error) {
        blockedReason = `serena mcp unavailable: ${String(error)}`;
      }
    },
    run: async (ctx, scenario) => {
      if (config) {
        const mapped = fromConfig(scenario.kind, ctx.workspace, scenario.query);
        if (!mapped) {
          return { status: "unsupported", text: "", reason: "no serena command config provided" };
        }
        return mapped;
      }

      if (blockedReason) {
        return {
          status: "unsupported",
          text: "",
          reason: blockedReason,
        };
      }
      if (!client) {
        return {
          status: "unsupported",
          text: "",
          reason: "serena client not initialized",
        };
      }

      try {
        if (scenario.kind === "status") {
          const result = await client.callTool({ name: "get_current_config", arguments: {} });
          return { status: "ok", text: extractToolText(result) };
        }
        if (scenario.kind === "files") {
          const result = await client.callTool({
            name: "find_file",
            arguments: { file_mask: `*${scenario.query}*`, relative_path: "." },
          });
          return { status: "ok", text: extractToolText(result) };
        }
        if (scenario.kind === "symbols") {
          const result = await client.callTool({
            name: "find_symbol",
            arguments: { name_path_pattern: scenario.query, substring_matching: true, relative_path: "src" },
          });
          return { status: "ok", text: extractToolText(result) };
        }
        if (scenario.kind === "search") {
          const result = await client.callTool({
            name: "search_for_pattern",
            arguments: { substring_pattern: scenario.query, relative_path: ".", max_answer_chars: 20000 },
          });
          return { status: "ok", text: extractToolText(result) };
        }

        const files = await client.callTool({
          name: "find_file",
          arguments: { file_mask: "*homebrew*", relative_path: "." },
        });
        const symbols = await client.callTool({
          name: "find_symbol",
          arguments: { name_path_pattern: "build", substring_matching: true, relative_path: "src" },
        });
        const code = await client.callTool({
          name: "search_for_pattern",
          arguments: { substring_pattern: "homebrew|pnpm|build", relative_path: ".", max_answer_chars: 20000 },
        });
        return {
          status: "ok",
          text: [extractToolText(files), extractToolText(symbols), extractToolText(code)].join("\n"),
        };
      } catch (error) {
        return {
          status: "error",
          text: "",
          reason: String(error),
        };
      }
    },
    teardown: async () => {
      if (transport) {
        await transport.close();
      }
      transport = null;
      client = null;
    },
  };
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
  const outputDir = resolve(getArg("--out") ?? "benchmarks/results/latest");
  const serenaConfigPath = getArg("--serena-config");

  const serenaConfig = await loadExternalCommandConfig(serenaConfigPath);

  const adapters: Adapter[] = [
    createVeilAdapter(),
    createShellAdapter(),
    createSerenaAdapter(serenaConfig),
  ];

  const ctx: RunContext = { workspace };

  for (const adapter of adapters) {
    await adapter.prepare(ctx);
  }

  const competitorReports: CompetitorReport[] = [];

  for (const adapter of adapters) {
    const scenarios: Record<string, ScenarioSummary> = {};

    for (const scenario of SCENARIOS) {
      const cold = await runScenarioPhase(adapter, ctx, scenario, "cold", coldIterations);
      if (cold.status !== "ok") {
        scenarios[scenario.id] = {
          status: cold.status,
          reason: cold.reason,
          cold: summarize(cold.samples),
          warm: summarize([]),
        };
        continue;
      }

      const warm = await runScenarioPhase(adapter, ctx, scenario, "warm", warmIterations);
      scenarios[scenario.id] = {
        status: warm.status,
        reason: warm.reason,
        cold: summarize(cold.samples),
        warm: summarize(warm.samples),
      };
    }

    competitorReports.push({
      id: adapter.id,
      label: adapter.label,
      scenarios,
    });
  }

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

  for (const adapter of adapters) {
    if (adapter.teardown) {
      await adapter.teardown();
    }
  }

  process.stdout.write(`${JSON.stringify({ ok: true, json: jsonPath, markdown: markdownPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
