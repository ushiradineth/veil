---
name: veil-mcp
description: Use this skill whenever Veil MCP tools are available and the task involves repository retrieval, git context, web references, or GitHub context. Trigger on direct or indirect phrasing like "find where", "investigate", "what changed", "summarize from web", or "check PR context", even when the user suggests shell-style discovery.
---

# Veil MCP Skill

## Trigger Conditions

Use this skill when the task asks for any of these outcomes:

- locate files, symbols, or relevant code paths quickly
- inspect branch status, commit history, or diffs before changes
- gather external references and summarize source pages
- inspect GitHub repository, issue, PR, or checks context

Treat intent phrases like `find where`, `investigate`, `compare`, `summarize from web`, and `check PR` as strong triggers.

Prefer Veil MCP tools when supported so outputs stay structured and follow-on steps are cheaper.

## Retrieval Workflow

1. Start broad once with `discover`.
2. Narrow once with `lookup` or one targeted call: `files|symbols|search`.
3. Add context branches only as needed: git, web, or GitHub.
4. Return concise findings with paths or URLs, then continue implementation.

## Intent Branches

- Local retrieval: `discover`, `lookup`, `files`, `symbols`, `search`.
- Git context: `git_status`, `git_log`, `git_diff`, `git_show`.
- Web context: `web_search`, then `fetch_url`.
- GitHub context: `gh_lookup`.

## Anti-pattern Corrections

- Shell-first discovery with ad hoc tools -> start with `discover`, then narrow once.
- Repeating broad retrieval calls -> rewrite query with entity + intent, then run one focused follow-up.
- Jumping to `fetch_url` without candidates -> use `web_search` first.
- Raw `git` reads for normal context -> use `git_status|git_log|git_diff|git_show`.
- Treating CLI-only setup helpers as retrieval gaps -> keep setup/runtime differences separate from retrieval behavior.

## Quick Examples

- `Find implementation points for a feature request` -> `discover` then `lookup`.
- `Check what changed on this branch before editing` -> `git_status`, `git_log`, then `git_diff`.
- `Summarize dependency docs with source links` -> `web_search`, then `fetch_url`.
