import { CLI_COMMANDS, CLI_COMMAND_DESCRIPTIONS, type CliCommandName } from "./tool-contract";

type CliCommandSpec = {
  name: CliCommandName;
  description: string;
  usage: string;
  examples: string[];
};

export const CLI_COMMAND_REGISTRY: readonly CliCommandSpec[] = [
  {
    name: "build",
    description: CLI_COMMAND_DESCRIPTIONS.build,
    usage: "veil build --workspace <path>",
    examples: ["veil build --workspace ."],
  },
  {
    name: "refresh",
    description: CLI_COMMAND_DESCRIPTIONS.refresh,
    usage: "veil refresh --workspace <path> [--mode full|changed]",
    examples: ["veil refresh --workspace . --mode changed"],
  },
  {
    name: "status",
    description: CLI_COMMAND_DESCRIPTIONS.status,
    usage: "veil status --workspace <path>",
    examples: ["veil status --workspace ."],
  },
  {
    name: "init",
    description: CLI_COMMAND_DESCRIPTIONS.init,
    usage: "veil init --workspace <path> [--mode full|changed]",
    examples: ["veil init --workspace . --mode changed"],
  },
  {
    name: "discover",
    description: CLI_COMMAND_DESCRIPTIONS.discover,
    usage: "veil discover --workspace <path> --query <text>",
    examples: ['veil discover --workspace . --query "find build logic"'],
  },
  {
    name: "lookup",
    description: CLI_COMMAND_DESCRIPTIONS.lookup,
    usage: "veil lookup --workspace <path> --query <text>",
    examples: ['veil lookup --workspace . --query "where is buildIndex defined"'],
  },
  {
    name: "files",
    description: CLI_COMMAND_DESCRIPTIONS.files,
    usage: "veil files --workspace <path> --query <text> [--limit <n>]",
    examples: ['veil files --workspace . --query "src" --limit 20'],
  },
  {
    name: "symbols",
    description: CLI_COMMAND_DESCRIPTIONS.symbols,
    usage: "veil symbols --workspace <path> --query <text> [--limit <n>]",
    examples: ['veil symbols --workspace . --query "runCli" --limit 20'],
  },
  {
    name: "search",
    description: CLI_COMMAND_DESCRIPTIONS.search,
    usage: "veil search --workspace <path> --query <text> [--limit <n>]",
    examples: ['veil search --workspace . --query "pnpm install" --limit 10'],
  },
  {
    name: "web-search",
    description: CLI_COMMAND_DESCRIPTIONS["web-search"],
    usage: "veil web-search --query <text> [--limit <n>]",
    examples: ['veil web-search --query "typescript language server" --limit 5'],
  },
  {
    name: "fetch-url",
    description: CLI_COMMAND_DESCRIPTIONS["fetch-url"],
    usage: "veil fetch-url --url <url> [--format markdown|text|html]",
    examples: ["veil fetch-url --url https://www.iana.org/domains/reserved --format markdown"],
  },
  {
    name: "diagnostics",
    description: CLI_COMMAND_DESCRIPTIONS.diagnostics,
    usage: "veil diagnostics",
    examples: ["veil diagnostics"],
  },
  {
    name: "git-status",
    description: CLI_COMMAND_DESCRIPTIONS["git-status"],
    usage: "veil git-status --workspace <path>",
    examples: ["veil git-status --workspace ."],
  },
  {
    name: "git-log",
    description: CLI_COMMAND_DESCRIPTIONS["git-log"],
    usage: "veil git-log --workspace <path> [--limit <n>]",
    examples: ["veil git-log --workspace . --limit 10"],
  },
  {
    name: "git-diff",
    description: CLI_COMMAND_DESCRIPTIONS["git-diff"],
    usage: "veil git-diff --workspace <path>",
    examples: ["veil git-diff --workspace ."],
  },
  {
    name: "git-show",
    description: CLI_COMMAND_DESCRIPTIONS["git-show"],
    usage: "veil git-show --workspace <path> --rev <rev>",
    examples: ["veil git-show --workspace . --rev HEAD"],
  },
  {
    name: "gh-lookup",
    description: CLI_COMMAND_DESCRIPTIONS["gh-lookup"],
    usage: "veil gh-lookup --repo <owner/name> --kind <repo_context|issues|prs|checks>",
    examples: ["veil gh-lookup --repo ushiradineth/veil --kind repo_context"],
  },
];

const registryNames = new Set(CLI_COMMAND_REGISTRY.map((entry) => entry.name));
for (const name of CLI_COMMANDS) {
  if (!registryNames.has(name)) {
    throw new Error("Missing CLI command metadata for " + name);
  }
}
