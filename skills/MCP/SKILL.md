---
name: veil-mcp
description: Route agent work through Veil MCP tools with lean retrieval-first sequencing.
---

# Veil MCP Skill

- Use MCP tools directly: `discover`, `lookup`, `files`, `symbols`, `search`.
- Start with `discover`, then use one targeted follow-up call.
- Use `git_status`, `git_log`, `git_diff`, `git_show` for repository context.
- Use `web_search` and `fetch_url` for external references.
- Use `gh_lookup` for GitHub context.
- Keep calls short, avoid non-Veil fallbacks unless unsupported.
