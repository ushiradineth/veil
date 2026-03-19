export const TOOL_DESCRIPTIONS = {
  veil_status: "Use when you need index status or staleness.",
  veil_refresh: "Use when you need to rebuild index state.",
  veil_build: "Use when you need a full index rebuild.",
  veil_init: "Use when you need non-interactive setup planning for CLI or MCP.",
  veil_files: "Use when you need file path matches.",
  veil_symbols: "Use when you need symbol name matches.",
  veil_search: "Use when you need indexed keyword matches. Omit default args unless overriding.",
  veil_lookup:
    "Use when you need ranked natural-language code context. Omit default args unless overriding.",
  veil_discover:
    "Use when you need one broad first retrieval call. Omit default args unless overriding.",
  veil_chunk: "Use when you need full content for one chunk id.",
  veil_grammar_list: "Use when you need parser availability and enabled state.",
  veil_grammar_install: "Use when you need to enable parser IDs.",
  veil_grammar_remove: "Use when you need to disable parser IDs.",
  veil_grammar_update: "Use when you need parser metadata refresh.",
  veil_web_search: "Use when you need external docs or web references.",
  veil_fetch_url:
    "Use when you need markdown-first page content from a URL. Omit default args unless overriding.",
  veil_git_status:
    "Use when you need branch or dirty-tree context. Omit default args unless overriding.",
  veil_git_log: "Use when you need commit history context.",
  veil_git_diff: "Use when you need diff content for changes.",
  veil_git_show: "Use when you need commit details for one revision.",
  veil_gh_lookup: "Use when you need GitHub issues, PRs, checks, or repo bootstrap.",
  veil_diagnostics: "Use when you need cache or latency diagnostics.",
} as const;

export const CLI_COMMANDS = [
  "build",
  "refresh",
  "status",
  "init",
  "discover",
  "chunk",
  "lookup",
  "files",
  "symbols",
  "search",
  "web-search",
  "fetch-url",
  "grammar",
  "diagnostics",
  "git-status",
  "git-log",
  "git-diff",
  "git-show",
  "gh-lookup",
] as const;

export type CliCommandName = (typeof CLI_COMMANDS)[number];

export const CLI_COMMAND_DESCRIPTIONS: Record<CliCommandName, string> = {
  build: "Full index rebuild",
  refresh: "Incremental index rebuild",
  status: "Index freshness and manifest status",
  init: "Initialize setup for CLI or MCP mode",
  discover: "Combined discovery: files, symbols, search",
  chunk: "Fetch one chunk by id",
  lookup: "Ranked intent-aware retrieval",
  files: "File path lookup by query",
  symbols: "Symbol lookup by name",
  search: "Indexed code/content search",
  "web-search": "External web search across providers",
  "fetch-url": "Fetch and normalize URL content",
  grammar: "Manage parser language selections",
  diagnostics: "Cache and latency diagnostics",
  "git-status": "Git branch and dirty-tree summary",
  "git-log": "Recent git commits",
  "git-diff": "Working or ranged git diff",
  "git-show": "Show details for one git revision",
  "gh-lookup": "GitHub context lookup via gh CLI",
};
