export const TOOL_DESCRIPTIONS = {
  veil_status: "Use when you need index status or staleness.",
  veil_refresh: "Use when you need to rebuild index state.",
  veil_build: "Use when you need a full index rebuild.",
  veil_files: "Use when you need file path matches.",
  veil_symbols: "Use when you need symbol name matches.",
  veil_search: "Use when you need indexed keyword matches. Omit default args unless overriding.",
  veil_lookup:
    "Use when you need ranked natural-language code context. Defaults are compact; request full detail only when needed.",
  veil_discover:
    "Use when you need one broad first retrieval call. Omit default args unless overriding.",
  veil_chunk: "Use when you need full content for one chunk id.",
  veil_grammar_list: "Use when you need parser availability and enabled state.",
  veil_grammar_install: "Use when you need to enable parser IDs.",
  veil_grammar_remove: "Use when you need to disable parser IDs.",
  veil_grammar_update: "Use when you need parser metadata refresh.",
  veil_web_search: "Use when you need external docs or web references.",
  veil_fetch_url:
    "Use when you need markdown-first page content from a URL. Defaults are bounded for token safety; override only when needed.",
  veil_git_status:
    "Use when you need branch or dirty-tree context. Path lists are opt-in; request them only when needed.",
  veil_git_log: "Use when you need commit history context.",
  veil_git_diff: "Use when you need diff content for changes.",
  veil_git_show: "Use when you need commit details for one revision.",
  veil_gh_lookup: "Use when you need GitHub issues, PRs, checks, or repo bootstrap.",
  veil_diagnostics: "Use when you need cache or latency diagnostics.",
} as const;
