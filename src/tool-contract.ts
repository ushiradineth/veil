export const TOOL_DESCRIPTIONS = {
  veil_status: "Use when you need index status or staleness.",
  veil_update_check: "Use when you need MCP package and skill update status.",
  veil_refresh: "Use when you need to rebuild index state.",
  veil_build: "Use when you need a full index rebuild.",
  veil_files: "Use when you need file path matches.",
  veil_symbols: "Use when you need symbol name matches.",
  veil_search: "Use when you need exact indexed text or keyword matches.",
  veil_lookup:
    "Use when you need ranked natural-language context across files, symbols, and code chunks.",
  veil_discover:
    "Use when you need one broad triage pass because intent is unclear before narrowing.",
  veil_chunk: "Use when you need full content for one chunk id.",
  veil_grammar_list: "Use when you need parser availability and enabled state.",
  veil_grammar_install: "Use when you need to enable parser IDs.",
  veil_grammar_remove: "Use when you need to disable parser IDs.",
  veil_grammar_update: "Use when you need parser metadata refresh.",
  veil_grammar_recommend:
    "Use when you need parser improvement suggestions for unsupported or disabled language coverage.",
  veil_grammar_runtime_install:
    "Use when you need explicit, approved runtime package install for parser IDs.",
  veil_web_search: "Use when you need external docs or web references.",
  veil_fetch_url: "Use when you need markdown-first page content from a URL.",
  veil_git_status: "Use when you need branch or dirty-tree context.",
  veil_git_log: "Use when you need commit history context.",
  veil_git_diff: "Use when you need diff content for changes.",
  veil_git_show: "Use when you need commit details for one revision.",
  veil_gh_lookup: "Use when you need GitHub issues, PRs, checks, or repo bootstrap.",
  veil_diagnostics: "Use when you need cache or latency diagnostics.",
} as const;
