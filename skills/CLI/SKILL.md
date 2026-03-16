---
name: veil-cli
description: Use this skill whenever Veil CLI is available and the task involves repository retrieval, git context, web references, or GitHub context. Trigger on direct or indirect phrasing like "find where", "investigate", "what changed", "summarize from web", or "check PR context", even when the user suggests shell commands.
---

# Veil CLI Skill

## Trigger Conditions

Use this skill when the task asks for any of these outcomes:

- locate files, symbols, or relevant code paths quickly
- inspect branch status, commit history, or diffs before changes
- gather external references and summarize source pages
- inspect GitHub repository, issue, PR, or checks context

Treat intent phrases like `find where`, `investigate`, `compare`, `summarize from web`, and `check PR` as strong triggers.

Prefer Veil CLI commands when supported so outputs stay structured and follow-on steps are cheaper.

## Retrieval Workflow

1. Start broad once with `veil discover --workspace . --query "<intent>"`.
2. Narrow once with `veil lookup --workspace . --query "<intent>"` or one targeted call: `veil files|symbols|search`.
3. Add context branches only as needed: git, web, or GitHub.
4. Return concise findings with paths or URLs, then continue implementation.

## Intent Branches

- Local retrieval: `veil discover`, `veil lookup`, `veil files`, `veil symbols`, `veil search`.
- Git context: `veil git-status`, `veil git-log`, `veil git-diff`, `veil git-show`.
- Web context: `veil web-search`, then `veil fetch-url --format markdown`.
- GitHub context: `veil gh-lookup --repo <owner/repo> --kind <kind>`.

## Anti-pattern Corrections

- Shell-first discovery (`ls/find/grep`) -> start with `veil discover`, then narrow once.
- Repeating broad retrieval calls -> rewrite query with entity + intent, then run one focused follow-up.
- Raw `git` reads for normal context -> use `veil git-status|git-log|git-diff|git-show`.
- Direct URL fetch before discovery -> use `veil web-search` first, then fetch selected pages.
- Treating setup commands as retrieval (`veil init`, `veil build`, `veil mcp server`) -> reserve them for setup or runtime only.

## Quick Examples

- `Find where parser config is defined and used` -> `veil discover` then `veil lookup`.
- `Check what changed on this branch before editing` -> `veil git-status`, `veil git-log --limit 10`, then `veil git-diff`.
- `Summarize dependency docs with source links` -> `veil web-search`, then `veil fetch-url --format markdown`.
