---
name: veil
description: Route agent tasks to Veil MCP tools with a practical local-first then web workflow.
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

- Lead with Veil tools for discovery and retrieval, then narrow with targeted follow-up calls.
- Use `discover` as the default local starting point for broad repo questions.
- Prefer Veil git, web, fetch, and GitHub tools when those calls are in scope.
- Use `fetch_url` for page extraction and keep `format=markdown` for agent-friendly content.
- Keep call sequences intentional and short, with one high-signal follow-up at a time.
- Rely on startup and query-path auto-refresh defaults for normal operation.
- Use explicit `refresh` when reindexing is requested, after large refactors, or while troubleshooting stale-index behavior.

## Auto-init behavior

- Startup can auto-init index state via `VEIL_SERVER_AUTO_INIT=1` (default enabled).
- Query tools can auto-refresh stale indexes via `VEIL_SERVER_AUTO_REFRESH_ON_QUERY=1` (default enabled for `files`, `symbols`, `search`, `lookup`).
- `discover` already performs stale-aware refresh behavior.
- Optional background maintenance can be enabled with:
  - `VEIL_SERVER_BACKGROUND_REFRESH=1`
  - `VEIL_SERVER_BACKGROUND_REFRESH_INTERVAL_MS`
  - `VEIL_SERVER_BACKGROUND_MAX_PER_HOUR`

## Query tips

- `discover`: user phrasing is usually enough.
- `lookup`: use specific intent phrasing, for example `where is <symbol> defined`.
- `web_search`: start short, then refine.
- `fetch_url`: set `format=markdown` and keep timeout and size bounded.

## Output expectations

- Keep responses concise.
- Include source URLs for web-derived claims.
- Clearly mark unsupported or partial results.
