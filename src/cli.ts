import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { withAgentGuidance } from "./agent-guidance";
import { diagnostics, profiler } from "./diagnostics";
import { fetchUrl } from "./fetch-url";
import { toToon } from "./format";
import { ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
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
import type { BuildMode } from "./types";
import { VEIL_VERSION } from "./version";
import { webSearch } from "./web-search";

type SharedArgs = {
  workspace?: string;
  stateRoot?: string;
  profile?: boolean;
};

type Intent = "auto" | "code" | "docs" | "symbols";

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

function withSharedOptions<T extends SharedArgs>(cmd: Argv<T>): Argv<T> {
  return cmd
    .option("workspace", { type: "string", desc: "Workspace root (default: cwd)" })
    .option("stateRoot", { type: "string", alias: "state-root", desc: "Override .veil state root" })
    .option("profile", { type: "boolean", default: false, desc: "Enable profiling report" });
}

export function createCli(args: string[] = []): Argv {
  const cli = yargs(args)
    .scriptName("veil")
    .usage("$0 <command> [options]")
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
    .example("veil status --workspace .")
    .example('veil discover --workspace . --query "build index"')
    .example("veil mcp server");

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

  cli.command<SharedArgs & { mode?: BuildMode; refreshIfStale?: boolean }>(
    "init",
    "Initialize index if missing or stale",
    (cmd) =>
      withSharedOptions(cmd)
        .option("mode", { choices: ["full", "changed"], default: "changed" as const })
        .option("refreshIfStale", { type: "boolean", alias: "refresh-if-stale", default: true }),
    async (argv) => {
      const { workspace, stateRoot } = configureContext(argv);
      const result = await initWorkspaceIndex(workspace, {
        state_root: stateRoot,
        mode: argv.mode ?? "changed",
        refresh_if_stale: argv.refreshIfStale ?? true,
      });
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
    }
  >(
    "fetch-url",
    "Fetch and normalize URL content",
    (cmd) =>
      withSharedOptions(cmd)
        .option("url", { type: "string", default: "" })
        .option("format", { choices: ["markdown", "text", "html"], default: "markdown" as const })
        .option("timeoutMs", { type: "number", alias: "timeout-ms", default: 8000 })
        .option("maxBytes", { type: "number", alias: "max-bytes", default: 200000 }),
    async (argv) => {
      configureContext(argv);
      const url = argv.url ?? "";
      const result = await fetchUrl({
        url,
        format: argv.format ?? "markdown",
        timeout_ms: argv.timeoutMs ?? 8000,
        max_bytes: argv.maxBytes ?? 200000,
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
