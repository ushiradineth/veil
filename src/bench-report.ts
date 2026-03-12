import { relative, resolve } from "node:path";

type Scenario = {
  id: string;
  kind: string;
  title: string;
};

type Stats = {
  p50_ms: number;
  p95_ms: number;
};

type ScenarioSummary = {
  status: "ok" | "unsupported" | "error";
  reason: string | null;
  warm: Stats;
  native_adoption?: {
    first_call_success: number;
    calls_to_useful_context: number;
    non_veil_fallback_rate: number;
  };
};

type CompetitorReport = {
  id: string;
  label: string;
  scenarios: Partial<Record<string, ScenarioSummary>>;
};

type SuiteReport = {
  generated_at: string;
  config: {
    workspace: string;
    profile?: "smoke" | "full";
    agents?: string[];
    mcp_modes?: string[];
    cold_iterations: number;
    warm_iterations: number;
    output_dir: string;
    competitors: string[];
    max_runtime_ms?: number;
    max_cell_runtime_ms?: number;
    preflight?: Record<
      string,
      {
        ready: boolean;
        mode_control: "strict" | "prompt_only";
        reason: string | null;
      }
    >;
  };
  scenarios: Scenario[];
  competitors: CompetitorReport[];
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toRunId(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = pad2(date.getUTCMonth() + 1);
  const dd = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  return `${String(yyyy)}${mm}${dd}-${hh}${min}${ss}Z`;
}

function coverageRows(scenarios: Scenario[]): string[] {
  return scenarios.map((scenario) => `| \`${scenario.kind}\` | \`${scenario.id}\` |`);
}

function scenarioComparisonRows(report: SuiteReport): string[] {
  const lines: string[] = [];
  const headers = ["Scenario", ...report.competitors.map((competitor) => competitor.label)];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const scenario of report.scenarios) {
    const cells = [scenario.id];
    for (const competitor of report.competitors) {
      const row = competitor.scenarios[scenario.id];
      if (row?.status !== "ok") {
        const label = row ? `${row.status}${row.reason ? `: ${row.reason}` : ""}` : "missing";
        cells.push(label.length <= 60 ? label : `${label.slice(0, 57)}...`);
        continue;
      }
      cells.push(`${row.warm.p50_ms.toFixed(4)} / ${row.warm.p95_ms.toFixed(4)}`);
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines;
}

function nativeAdoptionRows(report: SuiteReport): string[] {
  const lines: string[] = [];
  const headers = ["Scenario", ...report.competitors.map((competitor) => competitor.label)];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const scenario of report.scenarios) {
    const cells = [scenario.id];
    for (const competitor of report.competitors) {
      const row = competitor.scenarios[scenario.id];
      const native = row?.native_adoption;
      if (!native) {
        cells.push("missing");
        continue;
      }
      cells.push(
        `${native.first_call_success.toFixed(2)} / ${native.calls_to_useful_context.toFixed(2)} / ${native.non_veil_fallback_rate.toFixed(2)}`,
      );
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines;
}

export function toBenchmarksMarkdown(report: SuiteReport, repoRoot: string): string {
  const runDirRelative = relative(repoRoot, resolve(report.config.output_dir)).replace(/\\/g, "/");
  const lines: string[] = [];

  lines.push("# Benchmarks");
  lines.push("");
  lines.push("Auto-generated from the newest benchmark run.");
  lines.push("");
  lines.push("## Quick Run");
  lines.push("");
  lines.push("Build or refresh index:");
  lines.push("");
  lines.push("```bash");
  lines.push(
    "nix run nixpkgs#bun -- run src/cli.ts refresh --workspace /path/to/repo --mode changed",
  );
  lines.push("```");
  lines.push("");
  lines.push("Run benchmark suite:");
  lines.push("");
  lines.push("```bash");
  lines.push(
    "nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --profile smoke --cold 1 --warm 1",
  );
  lines.push("```");
  lines.push("");
  lines.push("## Latest Run");
  lines.push("");
  lines.push(`- Run directory: \`${runDirRelative}\``);
  lines.push(`- Result JSON: \`${runDirRelative}/results.json\``);
  lines.push(`- Summary markdown: \`${runDirRelative}/SUMMARY.md\``);
  lines.push(`- Generated: \`${report.generated_at}\``);
  lines.push(`- Workspace: \`${report.config.workspace}\``);
  if (report.config.profile) {
    lines.push(`- Profile: \`${report.config.profile}\``);
  }
  if (Array.isArray(report.config.agents)) {
    lines.push(`- Agents: \`${report.config.agents.join(",")}\``);
  }
  if (Array.isArray(report.config.mcp_modes)) {
    lines.push(`- Modes: \`${report.config.mcp_modes.join(",")}\``);
  }
  lines.push(
    `- Iterations: \`cold=${String(report.config.cold_iterations)}\`, \`warm=${String(report.config.warm_iterations)}\``,
  );
  if (typeof report.config.max_runtime_ms === "number") {
    lines.push(`- Runtime budget: \`${String(report.config.max_runtime_ms)}ms\``);
  }
  if (typeof report.config.max_cell_runtime_ms === "number") {
    lines.push(`- Cell budget: \`${String(report.config.max_cell_runtime_ms)}ms\``);
  }
  lines.push("");
  lines.push("## Scenario Coverage");
  lines.push("");
  lines.push("| MCP Tool | Scenario ID |");
  lines.push("| --- | --- |");
  lines.push(...coverageRows(report.scenarios));
  lines.push("");
  lines.push("## Warm Latency Comparison (p50 / p95 ms)");
  lines.push("");
  lines.push(...scenarioComparisonRows(report));
  if (report.config.preflight) {
    lines.push("");
    lines.push("## Preflight");
    lines.push("");
    lines.push("| Competitor | Ready | Mode Control | Reason |");
    lines.push("| --- | --- | --- | --- |");
    for (const competitor of report.competitors) {
      const pre = report.config.preflight[competitor.id];
      const ready = pre?.ready ? "yes" : "no";
      const mode = pre?.mode_control ?? "prompt_only";
      const reason = pre?.reason ?? "";
      lines.push(`| ${competitor.label} | ${ready} | ${mode} | ${reason} |`);
    }
  }
  lines.push("");
  lines.push(
    "## Native Choice Signals (first_call_success / calls_to_useful_context / non_veil_fallback_rate)",
  );
  lines.push("");
  lines.push(...nativeAdoptionRows(report));
  lines.push("");
  lines.push("Notes:");
  lines.push("");
  lines.push(
    "- Web and GitHub scenarios are network dependent and usually much slower than local index queries.",
  );
  lines.push(
    "- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.",
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
}
