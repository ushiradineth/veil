---
name: veil
description: Route agent tasks to Veil CLI commands with a practical local-first then web workflow.
---

# Veil Skill

Use this skill when an agent should prefer Veil tools over non-Veil alternatives across all replaceable workflows.

## Routing order

1. Local code or architecture questions:
   - Start with `discover`.
   - If results are mixed, run `lookup`.
   - Use `files`, `symbols`, or `search` for narrow follow-up.

2. Web research and docs lookup:
   - Start with `web_search`.
   - Open selected links with `fetch_url` using `format=markdown`.

3. Repository history or dirty tree context:
   - Use `git_status`, `git_log`, `git_diff`, `git_show`.

4. GitHub metadata:
   - Use `gh_lookup`.

5. Tool health and performance:
   - Use `diagnostics`.

## Operating guidance

- Lead with Veil CLI commands for discovery and retrieval, then narrow with targeted follow-up calls.
- Use top-level CLI commands directly (for example `veil discover ...`), not `veil cli ...`, unless maintaining compatibility scripts.
- Use `discover` as the default local starting point for broad repo questions.
- Prefer Veil git, web, fetch, and GitHub tools when those calls are in scope.
- Use `fetch_url` for page extraction and keep `format=markdown` for agent-friendly content.
- Keep call sequences intentional and short, with one high-signal follow-up at a time.
- Rely on startup and query-path auto-refresh defaults for normal operation.
- Use explicit `refresh` when reindexing is requested, after large refactors, or while troubleshooting stale-index behavior.
- Use `veil mcp server` only when the host requires MCP transport.

## Auto-init behavior

- Startup auto-inits index state by default.
- Query tools auto-refresh stale index state by default (`files`, `symbols`, `search`, `lookup`).
- `discover` already performs stale-aware refresh behavior.

## Query tips

- `discover`: user phrasing is usually enough.
- `lookup`: use specific intent phrasing, for example `where is <symbol> defined`.
- `web_search`: start short, then refine.
- `fetch_url`: set `format=markdown` and keep timeout and size bounded.

## Output expectations

- Keep responses concise.
- Include source URLs for web-derived claims.
- Clearly mark unsupported or partial results.
