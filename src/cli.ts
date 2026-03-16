import { spawnSync } from "node:child_process";
import { sep } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import { confirm, isCancel, log, multiselect, select, spinner } from "@clack/prompts";
import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { withAgentGuidance } from "./agent-guidance";
import { diagnostics, profiler } from "./diagnostics";
import { fetchUrl } from "./fetch-url";
import { toToon } from "./format";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
import {
  BUILTIN_PARSERS,
  getParserConfig,
  installParsers,
  listParsers,
  parseParserList,
  removeParsers,
  setEnabledParsers,
  updateParsers,
  type ParserId,
} from "./grammar-manager";
import {
  buildIndex,
  discoverIndex,
  getStatus,
  initWorkspaceIndex,
  lookupIndex,
  queryChunks,
  queryFiles,
  querySymbols,
} from "./indexer";
import { diagnosticsStatePath } from "./state-root";
import type {
  BuildMode,
  InitSetupMode,
  InitSetupPackageManager,
  InitSetupResult,
  InitSetupStep,
} from "./types";
import { VEIL_VERSION } from "./version";
import { webSearch } from "./web-search";

type SharedArgs = {
  workspace?: string;
  stateRoot?: string;
  profile?: boolean;
};

type Intent = "auto" | "code" | "docs" | "symbols";

type McpClient = "claude" | "codex" | "opencode" | "other";

function parseIntent(value: unknown): Intent {
  return value === "code" || value === "docs" || value === "symbols" ? value : "auto";
}

function writeOutput(data: unknown): void {
  process.stdout.write(toToon(data) + "\n");
}

function configureContext(options: SharedArgs): { workspace: string; stateRoot?: string } {
  const workspace = options.workspace ?? process.cwd();
  diagnostics.configureStatePath(diagnosticsStatePath(workspace, options.stateRoot));
  if (options.profile) {
    profiler.enable();
    console.error("Profiling enabled");
  }
  return { workspace, stateRoot: options.stateRoot };
}

function withSharedOptions<T extends SharedArgs>(cmd: Argv<T>): Argv {
  return cmd
    .option("workspace", { type: "string", desc: "Workspace root (default: cwd)" })
    .option("stateRoot", { type: "string", alias: "state-root", desc: "Override .veil state root" })
    .option("profile", {
      type: "boolean",
      default: false,
      desc: "Enable profiling report",
    }) as Argv;
}

function parseInitMode(value: unknown): InitSetupMode {
  return value === "mcp" ? "mcp" : "cli";
}

function hasInteractiveTty(): boolean {
  return input.isTTY && output.isTTY;
}

async function selectInitModeInteractive(defaultMode: InitSetupMode): Promise<InitSetupMode> {
  const selected = await select({
    message: "Choose setup mode",
    options: [
      {
        value: "mcp",
        label: "MCP (recommended)",
      },
      {
        value: "cli",
        label: "CLI",
      },
    ],
    initialValue: defaultMode,
  });

  return isCancel(selected) ? defaultMode : selected;
}

async function confirmSkillInstallInteractive(): Promise<boolean> {
  const decision = await confirm({
    message: "Install Veil CLI skill now with your package manager?",
    initialValue: false,
  });
  return isCancel(decision) ? false : decision;
}

async function confirmMcpSkillInstallInteractive(): Promise<boolean> {
  const decision = await confirm({
    message: "Install Veil MCP skill now with your package manager?",
    initialValue: false,
  });
  return isCancel(decision) ? false : decision;
}

async function selectMcpClientsInteractive(): Promise<McpClient[]> {
  const picked = await multiselect<McpClient>({
    message: "Configure MCP for clients",
    options: [
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex" },
      { value: "opencode", label: "Opencode" },
      { value: "other", label: "Other" },
    ],
    initialValues: [],
    required: false,
  });
  return isCancel(picked) ? [] : picked;
}

async function selectParsersInteractive(defaultEnabled: ParserId[]): Promise<ParserId[]> {
  const picked = await multiselect<ParserId>({
    message: "Pick built-in parsers to enable",
    options: BUILTIN_PARSERS.map((parser) => ({
      value: parser.id,
      label: parser.label,
      hint: parser.id,
    })),
    initialValues: defaultEnabled,
    required: false,
  });
  return isCancel(picked) ? defaultEnabled : picked;
}

function inferInitPackageManager(
  userAgent: string | undefined = process.env.npm_config_user_agent,
  argv: string[] = process.argv,
  execPath: string = process.execPath,
  npmExecPath: string | undefined = process.env.npm_execpath,
): InitSetupPackageManager {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.startsWith("pnpm/")) return "pnpm";
  if (ua.startsWith("bun/")) return "bun";
  if (ua.startsWith("yarn/")) return "yarn";
  if (ua.startsWith("npm/")) return "npm";

  const lowerExecPath = execPath.toLowerCase();
  if (lowerExecPath.includes("/bun") || lowerExecPath.endsWith("bun")) return "bun";

  const lowerNpmExecPath = (npmExecPath ?? "").toLowerCase();
  if (lowerNpmExecPath.includes("pnpm")) return "pnpm";
  if (lowerNpmExecPath.includes("yarn")) return "yarn";
  if (lowerNpmExecPath.includes("npm")) return "npm";

  const joined = argv.join(" ").toLowerCase();
  if (joined.includes(" pnpm") || joined.includes("pnpm ")) return "pnpm";
  if (joined.includes(" bunx") || joined.includes(" bun ")) return "bun";
  if (joined.includes(" yarn") || joined.includes("yarn ")) return "yarn";
  if (joined.includes(" brew") || joined.includes("brew ")) return "brew";
  return "npm";
}

function renderCommand(command: string, args: string[]): string {
  const quoted = args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg));
  return [command, ...quoted].join(" ");
}

function commandForSkillInstall(
  packageManager: InitSetupPackageManager,
  skillName: "veil-cli" | "veil-mcp",
): string {
  const repo = "https://github.com/ushiradineth/veil";
  if (packageManager === "pnpm") {
    return renderCommand("pnpm", ["dlx", "skills", "add", repo, "--skill", skillName]);
  }
  if (packageManager === "bun") {
    return renderCommand("bun", ["x", "skills", "add", repo, "--skill", skillName]);
  }
  if (packageManager === "yarn") {
    return renderCommand("yarn", ["dlx", "skills", "add", repo, "--skill", skillName]);
  }
  return renderCommand("npx", ["-y", "skills", "add", repo, "--skill", skillName]);
}

function commandForMcpClientSetup(client: McpClient): string {
  if (client === "claude") {
    return "claude mcp add --scope user veil -- npx -y @ushiradineth/veil@latest mcp server";
  }
  if (client === "codex") {
    return "codex mcp add veil -- npx -y @ushiradineth/veil@latest mcp server";
  }
  if (client === "opencode") {
    return "opencode mcp add";
  }
  return "npx -y @ushiradineth/veil@latest mcp server";
}

function mcpSetupStepsForClients(clients: McpClient[]): InitSetupStep[] {
  return clients.map((client) => ({
    id: `setup-${client}`,
    label:
      client === "claude"
        ? "Configure Claude MCP"
        : client === "codex"
          ? "Configure Codex MCP"
          : client === "opencode"
            ? "Configure Opencode MCP"
            : "Configure other MCP client",
    command: commandForMcpClientSetup(client),
    status: "planned",
    ok: true,
    details: "ready",
  }));
}

function summarizeFailureDetails(detail: string): string {
  const normalized = detail.trim();
  if (!normalized) return "command failed";
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "command failed";

  const priority = lines.find((line) => line.includes("No matching skills found for:"));
  if (priority) return priority;
  const executable = lines.find((line) => line.includes("Executable not found in $PATH"));
  if (executable) return executable;
  const errorLine = lines.find((line) => line.startsWith("Error:"));
  if (errorLine) return errorLine;
  return lines[lines.length - 1] ?? "command failed";
}

function executeCommand(command: string): { ok: boolean; detail: string } {
  const parts = command.split(" ").filter(Boolean);
  const binary = parts[0];
  const args = parts.slice(1);
  if (!binary) return { ok: false, detail: "invalid command" };

  const result = spawnSync(binary, args, { encoding: "utf-8" });
  if (result.error) return { ok: false, detail: String(result.error) };
  if (result.status === 0) return { ok: true, detail: "completed" };

  const stdErr = result.stderr.trim();
  const stdOut = result.stdout.trim();
  return {
    ok: false,
    detail: stdErr || stdOut || `exit status ${String(result.status ?? -1)}`,
  };
}

function executeCommandWithInheritedOutput(command: string): { ok: boolean; detail: string } {
  const parts = command.split(" ").filter(Boolean);
  const binary = parts[0];
  const args = parts.slice(1);
  if (!binary) return { ok: false, detail: "invalid command" };

  const result = spawnSync(binary, args, { stdio: "inherit" });
  if (result.error) return { ok: false, detail: String(result.error) };
  if (result.status === 0) return { ok: true, detail: "completed" };
  return { ok: false, detail: `exit status ${String(result.status ?? -1)}` };
}

function runSetupStep(step: InitSetupStep): InitSetupStep {
  const run = executeCommand(step.command);
  if (run.ok) return { ...step, status: "ok", ok: true, details: "completed" };

  const concise = summarizeFailureDetails(run.detail);
  return { ...step, status: "failed", ok: false, details: concise };
}

function commandForCliInstall(packageManager: InitSetupPackageManager): string {
  if (packageManager === "pnpm") return renderCommand("pnpm", ["add", "-g", "@ushiradineth/veil"]);
  if (packageManager === "bun") return renderCommand("bun", ["add", "-g", "@ushiradineth/veil"]);
  if (packageManager === "yarn")
    return renderCommand("yarn", ["global", "add", "@ushiradineth/veil"]);
  if (packageManager === "brew") return renderCommand("brew", ["install", "veil"]);
  return renderCommand("npm", ["i", "-g", "@ushiradineth/veil"]);
}

function mcpServerSnippet(): string {
  return "npx -y @ushiradineth/veil@latest mcp server";
}

function initStepsForMode(
  mode: InitSetupMode,
  packageManager: InitSetupPackageManager,
): InitSetupStep[] {
  const skillInstall = {
    id: "install-skill",
    label: "Install Veil CLI skill",
    command: commandForSkillInstall(packageManager, "veil-cli"),
    status: "planned",
    ok: true,
    details: "ready",
  } satisfies InitSetupStep;
  const cliInstall = {
    id: "install-cli",
    label: "Install Veil CLI",
    command: commandForCliInstall(packageManager),
    status: "planned",
    ok: true,
    details: "ready",
  } satisfies InitSetupStep;
  const mcpSkillInstall = {
    id: "install-mcp-skill",
    label: "Install Veil MCP skill",
    command: commandForSkillInstall(packageManager, "veil-mcp"),
    status: "planned",
    ok: true,
    details: "optional",
  } satisfies InitSetupStep;
  if (mode === "cli") {
    return [cliInstall, skillInstall];
  }
  return [mcpSkillInstall];
}

function nextStepsForMode(mode: InitSetupMode): string[] {
  if (mode === "cli") {
    return [
      'Use `veil discover --workspace . --query "your question"` as your first retrieval call.',
      "Use `veil status --workspace .` to validate index freshness before longer tasks.",
      "Run your package manager's skills list command to confirm skill installation.",
    ];
  }
  return [
    "Run client-specific MCP setup commands for Claude, Codex, or OpenCode.",
    "Optionally install `veil-mcp` skill for transport-specific routing guidance.",
    "Verify runtime with `npx -y @ushiradineth/veil@latest mcp --help`.",
  ];
}

function runSetupStepInteractive(
  step: InitSetupStep,
  runStepFn: (value: InitSetupStep) => InitSetupStep,
  passthroughOutput: boolean,
): InitSetupStep {
  const s = spinner();
  s.start(`${step.label}: $ ${step.command}`);
  const result = passthroughOutput
    ? (() => {
        const run = executeCommandWithInheritedOutput(step.command);
        if (run.ok) {
          return { ...step, status: "ok" as const, ok: true, details: "completed" };
        }
        return { ...step, status: "failed" as const, ok: false, details: run.detail };
      })()
    : runStepFn(step);
  if (result.status === "ok") {
    s.stop(`${step.label} done`);
    return result;
  }
  if (result.status === "failed") {
    s.error(`${step.label} failed: ${summarizeFailureDetails(result.details)}`);
    return result;
  }
  if (result.status === "skipped") {
    s.stop(`${step.label} skipped`);
    return result;
  }
  s.stop(`${step.label} planned`);
  return result;
}

async function buildInitSetupResult(args: {
  workspace: string;
  stateRoot?: string;
  mode?: InitSetupMode;
  interactive?: boolean;
  yes?: boolean;
  parsers?: ParserId[];
  skipParserPrompt?: boolean;
  packageManager?: InitSetupPackageManager;
  executeInstalls?: boolean;
  skillInstallPrompt?: () => Promise<boolean>;
  runStep?: (step: InitSetupStep) => InitSetupStep;
}): Promise<InitSetupResult> {
  const interactive = (args.interactive ?? false) && hasInteractiveTty() && !args.yes;
  const selectedMode = args.mode ?? (interactive ? await selectInitModeInteractive("mcp") : "cli");
  const packageManager = args.packageManager ?? inferInitPackageManager();
  const runStepFn = args.runStep ?? runSetupStep;
  const promptSkillInstall = args.skillInstallPrompt ?? confirmSkillInstallInteractive;
  const promptMcpSkillInstall = confirmMcpSkillInstallInteractive;
  const executeInstalls = args.executeInstalls ?? true;
  const steps = initStepsForMode(selectedMode, packageManager);
  const parserCatalog = await listParsers(args.workspace, args.stateRoot);
  const parserConfig = await getParserConfig(args.workspace, args.stateRoot);
  let selectedParsers =
    args.parsers && args.parsers.length > 0 ? args.parsers : parserConfig.enabled;

  if (interactive && !args.skipParserPrompt && (!args.parsers || args.parsers.length === 0)) {
    selectedParsers = await selectParsersInteractive(selectedParsers);
  }
  await setEnabledParsers(args.workspace, selectedParsers, args.stateRoot);
  const finalParserConfig = await getParserConfig(args.workspace, args.stateRoot);

  let finalizedSteps = steps;
  let executed = false;
  let mcpSnippet: string | null = null;

  if (selectedMode === "mcp") {
    mcpSnippet = mcpServerSnippet();
    if (interactive) {
      const clients = await selectMcpClientsInteractive();
      const mcpSteps = mcpSetupStepsForClients(clients);
      const executedSteps: InitSetupStep[] = [];
      for (const step of mcpSteps) {
        if (step.id === "setup-other") {
          log.step(`Copy/paste this MCP command into your client config:\n  ${step.command}`);
          executedSteps.push({
            ...step,
            status: "planned",
            ok: true,
            details: "manual setup required",
          });
          continue;
        }
        executedSteps.push(runSetupStepInteractive(step, runStepFn, true));
      }

      let mcpSkillStep = steps[0];
      const shouldInstallMcpSkill = await promptMcpSkillInstall();
      if (shouldInstallMcpSkill) {
        mcpSkillStep = runSetupStepInteractive(mcpSkillStep, runStepFn, false);
      } else {
        mcpSkillStep = { ...mcpSkillStep, status: "skipped", ok: true, details: "user skipped" };
      }
      executedSteps.push(mcpSkillStep);

      finalizedSteps = executedSteps;
      executed = mcpSteps.length > 0 || shouldInstallMcpSkill;
    }
  } else if (executeInstalls) {
    const cliStep = interactive
      ? runSetupStepInteractive(steps[0], runStepFn, false)
      : runStepFn(steps[0]);
    executed = true;

    let skillStep = steps[1];
    const shouldInstallSkill = interactive ? await promptSkillInstall() : Boolean(args.yes);
    if (shouldInstallSkill) {
      if (interactive) {
        log.info(
          "The skills installer is interactive. Select targets with space, then press enter.",
        );
        skillStep = runSetupStepInteractive(skillStep, runStepFn, false);
      } else {
        skillStep = runStepFn(skillStep);
      }
      executed = true;
    } else {
      skillStep = { ...skillStep, status: "skipped", ok: true, details: "user skipped" };
    }
    finalizedSteps = [cliStep, skillStep];
  }

  return {
    mode: selectedMode,
    interactive,
    package_manager: packageManager,
    executed,
    mcp_snippet: mcpSnippet,
    parsers: {
      available: parserCatalog.map((parser) => parser.id),
      enabled: finalParserConfig.enabled,
      installed: finalParserConfig.installed,
    },
    steps: finalizedSteps,
    next_steps: nextStepsForMode(selectedMode),
  };
}

export function createCli(args: string[] = []): Argv {
  const cli = yargs(args)
    .scriptName("veil")
    .usage("Usage: $0 <command> [options]")
    .help("help")
    .alias("help", "h")
    .version("version", "Display version number", VEIL_VERSION)
    .alias("version", "v")
    .strict()
    .strictCommands()
    .strictOptions()
    .showHelpOnFail(true)
    .recommendCommands()
    .exitProcess(false)
    .example([
      ["veil status --workspace ."],
      ['veil discover --workspace . --query "build index"'],
      ["veil mcp server"],
    ]);

  cli.command<SharedArgs>(
    "build",
    "Full index rebuild",
    (cmd) => withSharedOptions(cmd),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const manifest = await buildIndex(workspace, "full", { state_root: stateRoot });
      writeOutput({ ok: true, mode: "full", manifest });
    },
  );

  cli.command<SharedArgs & { mode?: BuildMode }>(
    "refresh",
    "Incremental index rebuild",
    (cmd) =>
      withSharedOptions(cmd).option("mode", {
        choices: ["full", "changed"],
        default: "changed" as const,
      }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const mode = argv.mode ?? "changed";
      const manifest = await buildIndex(workspace, mode, { state_root: stateRoot });
      writeOutput(withAgentGuidance("refresh", { ok: true, mode, manifest }));
    },
  );

  cli.command<SharedArgs>(
    "status",
    "Index freshness and manifest status",
    (cmd) => withSharedOptions(cmd),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const status = await getStatus(workspace, { state_root: stateRoot });
      writeOutput(withAgentGuidance("status", status));
    },
  );

  cli.command<
    SharedArgs & {
      mode?: InitSetupMode;
      interactive?: boolean;
      yes?: boolean;
      rawOutput?: boolean;
      parsers?: string;
      skipParserPrompt?: boolean;
    }
  >(
    "init",
    "Initialize setup for CLI or MCP mode",
    (cmd) =>
      withSharedOptions(cmd)
        .option("mode", { choices: ["cli", "mcp"] as const })
        .option("interactive", { type: "boolean", default: true })
        .option("yes", {
          type: "boolean",
          default: false,
          desc: "For CLI mode, install skill without prompting",
        })
        .option("rawOutput", {
          type: "boolean",
          alias: "raw-output",
          default: false,
          desc: "Print structured TOON output in interactive mode",
        })
        .option("parsers", {
          type: "string",
          desc: "Comma-separated parser IDs (js,ts,python,json,bash,go,rust)",
        })
        .option("skipParserPrompt", {
          type: "boolean",
          alias: "skip-parser-prompt",
          default: false,
          desc: "Skip interactive parser selection prompt",
        }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const result = await buildInitSetupResult({
        workspace,
        stateRoot,
        mode: argv.mode ? parseInitMode(argv.mode) : undefined,
        interactive: argv.interactive ?? true,
        yes: argv.yes ?? false,
        parsers: parseParserList(argv.parsers ?? ""),
        skipParserPrompt: argv.skipParserPrompt ?? false,
      });
      const useInteractiveSummary = (argv.interactive ?? true) && hasInteractiveTty();
      if (useInteractiveSummary && !argv.rawOutput) {
        return;
      }
      writeOutput(result);
    },
  );

  cli.command<SharedArgs & { query?: string; intent?: Intent; refreshIfStale?: boolean }>(
    "discover",
    "Combined discovery: files, symbols, search",
    (cmd) =>
      withSharedOptions(cmd)
        .option("query", { type: "string", default: "" })
        .option("intent", {
          choices: ["auto", "code", "docs", "symbols"],
          default: "auto" as const,
        })
        .option("refreshIfStale", { type: "boolean", alias: "refresh-if-stale", default: true }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const query = argv.query ?? "";
      const initResult = await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: argv.refreshIfStale ?? true,
      });
      const discovered = await discoverIndex(workspace, query, {
        prefer_code: true,
        intent: parseIntent(argv.intent),
        state_root: stateRoot,
      });
      writeOutput(
        withAgentGuidance(
          "discover",
          {
            status: initResult.status_after,
            intent: discovered.intent,
            files: discovered.files,
            symbols: discovered.symbols,
            chunks: discovered.chunks,
          },
          { query },
        ),
      );
    },
  );

  cli.command<SharedArgs & { query?: string; intent?: Intent }>(
    "lookup",
    "Ranked intent-aware retrieval",
    (cmd) =>
      withSharedOptions(cmd)
        .option("query", { type: "string", default: "" })
        .option("intent", {
          choices: ["auto", "code", "docs", "symbols"],
          default: "auto" as const,
        }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const query = argv.query ?? "";
      const result = await lookupIndex(workspace, query, {
        intent: parseIntent(argv.intent),
        prefer_code: true,
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("lookup", result, { query }));
    },
  );

  cli.command<SharedArgs & { query?: string; limit?: number; refreshIfStale?: boolean }>(
    "files",
    "File path lookup by query",
    (cmd) =>
      withSharedOptions(cmd)
        .option("query", { type: "string", default: "" })
        .option("limit", { type: "number", default: 20 })
        .option("refreshIfStale", { type: "boolean", alias: "refresh-if-stale", default: true }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const query = argv.query ?? "";
      await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: argv.refreshIfStale ?? true,
      });
      const items = await queryFiles(workspace, query, argv.limit ?? 20, { state_root: stateRoot });
      writeOutput(withAgentGuidance("files", { items }, { query }));
    },
  );

  cli.command<SharedArgs & { query?: string; limit?: number; refreshIfStale?: boolean }>(
    "symbols",
    "Symbol lookup by name",
    (cmd) =>
      withSharedOptions(cmd)
        .option("query", { type: "string", default: "" })
        .option("limit", { type: "number", default: 20 })
        .option("refreshIfStale", { type: "boolean", alias: "refresh-if-stale", default: true }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const query = argv.query ?? "";
      await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: argv.refreshIfStale ?? true,
      });
      const items = await querySymbols(workspace, query, argv.limit ?? 20, {
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("symbols", { items }, { query }));
    },
  );

  cli.command<
    SharedArgs & {
      query?: string;
      limit?: number;
      refreshIfStale?: boolean;
      preferCode?: boolean;
      intent?: Intent;
    }
  >(
    "search",
    "Indexed code/content search",
    (cmd) =>
      withSharedOptions(cmd)
        .option("query", { type: "string", default: "" })
        .option("limit", { type: "number", default: 10 })
        .option("refreshIfStale", { type: "boolean", alias: "refresh-if-stale", default: true })
        .option("preferCode", { type: "boolean", alias: "prefer-code", default: true })
        .option("intent", {
          choices: ["auto", "code", "docs", "symbols"],
          default: "auto" as const,
        }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const query = argv.query ?? "";
      await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        refresh_if_stale: argv.refreshIfStale ?? true,
      });
      const items = await queryChunks(workspace, query, argv.limit ?? 10, {
        prefer_code: argv.preferCode ?? true,
        intent: parseIntent(argv.intent),
        state_root: stateRoot,
      });
      writeOutput(withAgentGuidance("search", { items }, { query }));
    },
  );

  cli.command<SharedArgs & { query?: string; limit?: number; timeoutMs?: number; debug?: boolean }>(
    "web-search",
    "External web search across providers",
    (cmd) =>
      withSharedOptions(cmd)
        .option("query", { type: "string", default: "" })
        .option("limit", { type: "number", default: 8 })
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 5000 })
        .option("debug", { type: "boolean", default: false }),
    async (argv) => {
      const { workspace } = configureContext(argv);
      const query = argv.query ?? "";
      const result = await webSearch(workspace, {
        query,
        limit: argv.limit ?? 8,
        timeout_ms: argv.timeoutMs ?? 5000,
        debug: argv.debug ?? false,
      });
      writeOutput(withAgentGuidance("web_search", result, { query }));
    },
  );

  cli.command<
    SharedArgs & {
      url?: string;
      format?: "markdown" | "text" | "html";
      timeoutMs?: number;
      maxBytes?: number;
      allowPrivateNetwork?: boolean;
    }
  >(
    "fetch-url",
    "Fetch and normalize URL content",
    (cmd) =>
      withSharedOptions(cmd)
        .option("url", { type: "string", default: "" })
        .option("format", { choices: ["markdown", "text", "html"], default: "markdown" as const })
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 8000 })
        .option("maxBytes", { type: "number", alias: "max-bytes", default: 200000 })
        .option("allowPrivateNetwork", {
          type: "boolean",
          alias: "allow-private-network",
          default: false,
        }),
    async (argv) => {
      configureContext(argv);
      const url = argv.url ?? "";
      const result = await fetchUrl({
        url,
        format: argv.format ?? "markdown",
        timeout_ms: argv.timeoutMs ?? 8000,
        max_bytes: argv.maxBytes ?? 200000,
        allow_private_network: argv.allowPrivateNetwork ?? false,
      });
      writeOutput(withAgentGuidance("fetch_url", result, { query: url }));
    },
  );

  cli.command<SharedArgs>(
    "diagnostics",
    "Cache and latency diagnostics",
    (cmd) => withSharedOptions(cmd),
    (argv) => {
      configureContext(argv);
      writeOutput(withAgentGuidance("diagnostics", diagnostics.getDiagnostics()));
    },
  );

  cli.command(
    "grammar",
    "Parser language management",
    (cmd) =>
      cmd
        .command<SharedArgs>(
          "list",
          "List built-in parser status",
          (sub) => withSharedOptions(sub),
          async (argv) => {
            const { workspace, stateRoot } = configureContext(argv);
            const parsers = await listParsers(workspace, stateRoot);
            writeOutput({ parsers });
          },
        )
        .command<SharedArgs & { parsers?: string }>(
          "install",
          "Enable parser IDs",
          (sub) =>
            withSharedOptions(sub).option("parsers", {
              type: "string",
              default: "",
              desc: "Comma-separated parser IDs",
            }),
          async (argv) => {
            const { workspace, stateRoot } = configureContext(argv);
            const ids = parseParserList(argv.parsers ?? "");
            const result = await installParsers(workspace, ids, stateRoot);
            writeOutput({ ok: true, installed: result.installed, enabled: result.enabled });
          },
        )
        .command<SharedArgs & { parsers?: string }>(
          "remove",
          "Disable and uninstall parser IDs",
          (sub) =>
            withSharedOptions(sub).option("parsers", {
              type: "string",
              default: "",
              desc: "Comma-separated parser IDs",
            }),
          async (argv) => {
            const { workspace, stateRoot } = configureContext(argv);
            const ids = parseParserList(argv.parsers ?? "");
            const result = await removeParsers(workspace, ids, stateRoot);
            writeOutput({ ok: true, installed: result.installed, enabled: result.enabled });
          },
        )
        .command<SharedArgs & { parsers?: string; all?: boolean }>(
          "update",
          "Refresh parser metadata for installed IDs",
          (sub) =>
            withSharedOptions(sub)
              .option("parsers", {
                type: "string",
                default: "",
                desc: "Comma-separated parser IDs",
              })
              .option("all", {
                type: "boolean",
                default: false,
                desc: "Update all installed parsers",
              }),
          async (argv) => {
            const { workspace, stateRoot } = configureContext(argv);
            const ids = argv.all ? "all" : parseParserList(argv.parsers ?? "");
            const result = await updateParsers(workspace, ids, stateRoot);
            writeOutput({ ok: true, updated: result.updated, installed: result.installed });
          },
        )
        .demandCommand(1)
        .strictCommands(),
    () => {
      return;
    },
  );

  cli.command<SharedArgs & { timeoutMs?: number }>(
    "git-status",
    "Git branch and dirty-tree summary",
    (cmd) =>
      withSharedOptions(cmd).option("timeoutMs", {
        type: "number",
        alias: "timeout-ms",
        default: 5000,
      }),
    (argv) => {
      const { workspace } = configureContext(argv);
      writeOutput(
        withAgentGuidance(
          "git_status",
          gitStatus(workspace, { timeout_ms: argv.timeoutMs ?? 5000 }),
        ),
      );
    },
  );

  cli.command<
    SharedArgs & {
      timeoutMs?: number;
      limit?: number;
      since?: string;
      author?: string;
      grep?: string;
    }
  >(
    "git-log",
    "Recent git commits",
    (cmd) =>
      withSharedOptions(cmd)
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 8000 })
        .option("limit", { type: "number", default: 30 })
        .option("since", { type: "string" })
        .option("author", { type: "string" })
        .option("grep", { type: "string" }),
    (argv) => {
      const { workspace } = configureContext(argv);
      writeOutput(
        withAgentGuidance(
          "git_log",
          gitLog(workspace, {
            timeout_ms: argv.timeoutMs ?? 8000,
            limit: argv.limit ?? 30,
            since: argv.since,
            author: argv.author,
            grep: argv.grep,
          }),
        ),
      );
    },
  );

  cli.command<
    SharedArgs & {
      timeoutMs?: number;
      maxBytes?: number;
      staged?: boolean;
      nameOnly?: boolean;
      path?: string;
      base?: string;
      head?: string;
    }
  >(
    "git-diff",
    "Working or ranged git diff",
    (cmd) =>
      withSharedOptions(cmd)
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 5000 })
        .option("maxBytes", { type: "number", alias: "max-bytes", default: 64000 })
        .option("staged", { type: "boolean", default: false })
        .option("nameOnly", { type: "boolean", alias: "name-only", default: false })
        .option("path", { type: "string" })
        .option("base", { type: "string" })
        .option("head", { type: "string" }),
    (argv) => {
      const { workspace } = configureContext(argv);
      writeOutput(
        withAgentGuidance(
          "git_diff",
          gitDiff(workspace, {
            timeout_ms: argv.timeoutMs ?? 5000,
            max_bytes: argv.maxBytes ?? 64000,
            staged: argv.staged ?? false,
            name_only: argv.nameOnly ?? false,
            path: argv.path,
            base: argv.base,
            head: argv.head,
          }),
        ),
      );
    },
  );

  cli.command<
    SharedArgs & {
      rev?: string;
      timeoutMs?: number;
      maxBytes?: number;
      path?: string;
      patch?: boolean;
    }
  >(
    "git-show",
    "Show details for one git revision",
    (cmd) =>
      withSharedOptions(cmd)
        .option("rev", { type: "string", default: "" })
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 8000 })
        .option("maxBytes", { type: "number", alias: "max-bytes", default: 64000 })
        .option("path", { type: "string" })
        .option("patch", { type: "boolean", default: true }),
    (argv) => {
      const { workspace } = configureContext(argv);
      writeOutput(
        withAgentGuidance(
          "git_show",
          gitShow(workspace, {
            rev: argv.rev ?? "",
            timeout_ms: argv.timeoutMs ?? 8000,
            max_bytes: argv.maxBytes ?? 64000,
            path: argv.path,
            patch: argv.patch ?? true,
          }),
        ),
      );
    },
  );

  cli.command<
    SharedArgs & {
      repo?: string;
      kind?: "repo_context" | "issues" | "prs" | "checks";
      query?: string;
      limit?: number;
      timeoutMs?: number;
      tempRoot?: string;
    }
  >(
    "gh-lookup",
    "GitHub context lookup via gh CLI",
    (cmd) =>
      withSharedOptions(cmd)
        .option("repo", { type: "string", default: "" })
        .option("kind", {
          choices: ["repo_context", "issues", "prs", "checks"],
          default: "repo_context" as const,
        })
        .option("query", { type: "string" })
        .option("limit", { type: "number", default: 10 })
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 12000 })
        .option("tempRoot", { type: "string", alias: "temp-root" }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const repo = argv.repo ?? "";
      const result = await ghLookup(workspace, {
        repo,
        kind: argv.kind ?? "repo_context",
        query: argv.query,
        limit: argv.limit ?? 10,
        timeout_ms: argv.timeoutMs ?? 12000,
        state_root: stateRoot,
        temp_root: argv.tempRoot,
      });
      writeOutput(withAgentGuidance("gh_lookup", result, { query: argv.query ?? repo }));
    },
  );

  cli.command(
    "mcp",
    "MCP namespace",
    (cmd) =>
      cmd
        .command(
          "server",
          "Start MCP stdio server",
          () => {
            return;
          },
          async () => {
            const { startServer } = await import("./server");
            await startServer();
          },
        )
        .demandCommand(1)
        .strictCommands(),
    () => {
      return;
    },
  );

  return cli;
}

function renderRootHelp(cli: Argv): string {
  let out = "";
  cli.showHelp((s: string) => {
    out += s;
  });
  return out.endsWith("\n") ? out : out + "\n";
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const args = hideBin(argv);
  const cli = createCli(args);
  if (args.length === 0) {
    process.stdout.write(renderRootHelp(cli));
    return;
  }
  try {
    await cli.parseAsync();
  } catch {
    process.exitCode = 1;
  }
}

export const __internalCli = {
  createCli,
  parseIntent,
  parseInitMode,
  inferInitPackageManager,
  buildInitSetupResult,
  initStepsForMode,
  commandForCliInstall,
  mcpServerSnippet,
};

const meta = import.meta as unknown as Record<string, unknown>;
const sourceSuffix = sep + "src" + sep + "cli.ts";
const isSourceModule = fileURLToPath(import.meta.url).endsWith(sourceSuffix);
const argvRefsSource = process.argv.some(
  (arg) => arg.endsWith(sep + "src" + sep + "cli.ts") || arg === "src/cli.ts",
);
if (isSourceModule && (meta.main === true || argvRefsSource)) {
  runCli().catch((error: unknown) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
