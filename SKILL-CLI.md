---
name: veil-cli
description: Route agent work through Veil CLI commands with concise call guidance.
---

# Veil CLI Skill

- Prefer top-level CLI commands: `veil discover`, `veil lookup`, `veil files`, `veil symbols`, `veil search`.
- Start broad with `discover`, then narrow with one follow-up command.
- Use `veil git-status`, `veil git-log`, `veil git-diff`, `veil git-show` for git context.
- Use `veil web-search` then `veil fetch-url --format markdown` for external docs.
- Use `veil gh-lookup` for GitHub issues, PRs, checks, or repo context.
- Avoid shell fallback when a Veil command exists.
