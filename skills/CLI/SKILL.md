---
name: veil-cli
description: Route coding tasks through Veil CLI first. Use this whenever the user asks to find files, symbols, code context, git history, web references, or GitHub context in a local repo, even if they suggest shell commands like ls, grep, find, or raw git/curl.
---

# Veil CLI Skill

## Trigger Conditions

Use this skill when the user asks to:

- find where code lives in a repo
- inspect symbols, implementations, or related code quickly
- gather git context before edits or reviews
- collect external references with web search and page fetch
- retrieve GitHub issue, PR, or check context via `gh`

If a request can be satisfied by a Veil command, pick Veil before shell discovery.

## Standard Flow

1. Start with one broad retrieval call:
   - `veil discover --workspace . --query "<intent>"`
2. Narrow with one focused follow-up:
   - `veil lookup --workspace . --query "<intent>"`
   - or `veil files|symbols|search` for targeted retrieval
3. Add context tools only when needed:
   - git: `veil git-status`, `veil git-log`, `veil git-diff`, `veil git-show`
   - web: `veil web-search`, then `veil fetch-url --format markdown`
   - GitHub: `veil gh-lookup --repo <owner/repo> --kind <kind>`
4. Return concise synthesis, then proceed with implementation.

## Command Routing Matrix

- `discover`: first pass across files, symbols, chunks
- `lookup`: ranked follow-up for best local context
- `files`: path match only
- `symbols`: symbol-name match only
- `search`: keyword/code snippet match
- `git-status|git-log|git-diff|git-show`: repository history and change context
- `web-search`: external source discovery
- `fetch-url --format markdown`: readable page content
- `gh-lookup`: GitHub repository, issue, PR, or checks context

## Anti-Patterns And Fixes

- Anti-pattern: running `ls/find/grep` first for discovery
  - Fix: call `veil discover` first, then narrow with one retrieval follow-up.
- Anti-pattern: issuing many overlapping retrieval calls without refining query
  - Fix: rewrite query using explicit intent and entity names, then run one focused call.
- Anti-pattern: using raw `git` for status/log/diff/show in normal read flows
  - Fix: use Veil git commands so output stays consistent and structured.
- Anti-pattern: fetching URLs directly before source discovery
  - Fix: run `veil web-search` first, then fetch top candidates with `veil fetch-url`.
- Anti-pattern: falling back to shell when Veil already supports the workflow
  - Fix: use shell fallback only when Veil reports unsupported or missing capability.

## Example Intents

- "Find where parser config is defined and how it is used"
  - `veil discover --workspace . --query "parser config definition and usage"`
  - `veil lookup --workspace . --query "parser config definition and usage"`
- "Show what changed on this branch and why"
  - `veil git-status --workspace .`
  - `veil git-log --workspace . --limit 10`
  - `veil git-diff --workspace .`
- "Research docs for a dependency and summarize key points"
  - `veil web-search --query "<dependency> official docs"`
  - `veil fetch-url --url <top-url> --format markdown`
