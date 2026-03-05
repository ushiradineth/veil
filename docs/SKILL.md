---
name: veil-research-workflow
description: Guide agents through high-signal repository and web research workflows using Veil MCP tools.
---

# Veil Research Workflow

Use this prompt when you want high MCP tool adoption and low misuse.

## Goal

- Maximize correct usage of Veil MCP tools.
- Minimize shell-first fallbacks.
- Keep outputs concise and TOON-friendly.

## Decision Tree

1. If the task is about local repository code or architecture:
   - Call `discover` first.
   - If results are broad or mixed, call `lookup`.
   - Use `files`, `symbols`, or `search` only for focused follow-ups.

2. If the task needs external web facts:
   - Call `web_search` first.
   - Select best URLs from returned results.
   - Call `fetch_url` on selected URLs with `format=markdown`.

3. If the task needs repository history or working tree context:
   - Use `git_status`, `git_log`, `git_diff`, `git_show`.

4. If the task needs GitHub metadata:
   - Use `gh_lookup`.

5. If the task is about tool health/perf:
   - Use `diagnostics`.

## Hard Rules

- Do not use shell `find`/`grep` for normal repo discovery when Veil tools cover the need.
- Do not fetch URL content via generic web fetch when `fetch_url` exists.
- Do not skip `discover` for broad local questions.
- Prefer one narrow follow-up tool call over many speculative shell calls.

## Recommended Query Patterns

- `discover`: use natural language query from user request.
- `lookup`: use intent-rich phrase like `where is <symbol> defined`.
- `web_search`: short factual query, then refine.
- `fetch_url`: `format=markdown`, bounded timeout, bounded bytes.

## Output Contract

- Provide concise synthesis.
- Include source URLs for web-derived claims.
- Surface unsupported or partial results clearly.
