---
name: veil-mcp
description: Route coding tasks through Veil MCP tools first. Use this whenever the user needs repository retrieval, git context, web references, or GitHub context, including cases where they ask for shell discovery or ad hoc external fetches.
---

# Veil MCP Skill

## Trigger Conditions

Use this skill when the user asks to:

- locate relevant code, files, or symbols quickly
- inspect current branch status, commit history, or diffs
- gather outside references and read source URLs
- inspect GitHub repo, issue, PR, or checks context

If an MCP tool exists for the task, call Veil MCP first.

## Standard Flow

1. Start with broad context:
   - `discover` with a clear intent query
2. Narrow with one focused retrieval call:
   - `lookup` for ranked context
   - or `files|symbols|search` for exact retrieval intent
3. Add supporting context only as needed:
   - git: `git_status|git_log|git_diff|git_show`
   - web: `web_search` then `fetch_url`
   - GitHub: `gh_lookup`
4. Return concise findings with source paths or URLs.

## Tool Routing Matrix

- `discover`: first broad retrieval across indexed context
- `lookup`: ranked local context for implementation decisions
- `files`: path-centric retrieval
- `symbols`: symbol-centric retrieval
- `search`: indexed keyword retrieval
- `git_status|git_log|git_diff|git_show`: repository context
- `web_search`: external candidate discovery
- `fetch_url`: normalized page retrieval for selected URLs
- `gh_lookup`: GitHub repository and PR/issue/check context

## Anti-Patterns And Fixes

- Anti-pattern: using shell tools before MCP retrieval tools
  - Fix: run `discover` first, then one narrowed MCP retrieval call.
- Anti-pattern: calling many MCP retrieval tools with the same vague query
  - Fix: refine the query with concrete entity names and intent, then retry one tool.
- Anti-pattern: jumping to `fetch_url` without candidate discovery
  - Fix: use `web_search` first to identify the best URLs.
- Anti-pattern: using raw git commands for read-only context flows
  - Fix: use `git_status|git_log|git_diff|git_show` for normalized output.
- Anti-pattern: defaulting to non-Veil fallback despite available tools
  - Fix: fallback only on explicit unsupported or error conditions.

## Example Tool Sequences

- Task: find implementation points for a feature request
  - `discover` -> `lookup`
- Task: inspect branch changes before commit or review
  - `git_status` -> `git_log` -> `git_diff`
- Task: compare external docs with local implementation
  - `web_search` -> `fetch_url` -> `search`
- Task: get PR context and inspect related local code
  - `gh_lookup` -> `discover` -> `lookup`
