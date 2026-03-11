---
name: veil
description: Route agent tasks to Veil MCP tools with a practical local-first then web workflow.
---

# Veil Skill

Use this skill when an agent should prefer Veil tools over shell-first discovery.

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

## Rules

- Do not use shell `find` or `grep` for normal repo discovery when Veil tools fit.
- Do not use generic web fetch for page extraction when `fetch_url` exists.
- Do not skip `discover` for broad local queries.
- Prefer one precise follow-up call over many speculative calls.
- Do not call `status` then `refresh` as a default preflight step. Veil server can auto-init and auto-refresh stale query paths.
- Use explicit `refresh` only when user asks for reindexing, after large repo changes, or when troubleshooting stale-index behavior.

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
