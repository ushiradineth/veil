# Veil CLI

Veil is a CLI/MCP Toolkit built for agent workflows that need fast, token-lean context before editing code.

It indexes a repository and provides focused commands for files, symbols, semantic lookup, web/fetch context, and git or GitHub reads.

Agents should:

- Start broad with `discover`
- Narrow with `lookup`, `search`, `files`, or `symbols`
- Use built-in git and web commands instead of ad hoc shell fallbacks

## Install the CLI

Requires Node.js 20 or later.

### With Homebrew

```bash
brew tap ushiradineth/homebrew https://github.com/ushiradineth/homebrew
brew install veil
```

### npm

```bash
npm i -g @ushiradineth/veil
```

## Install Skill

```bash
npx -y skills add https://github.com/ushiradineth/veil --skill veil
```

## Commands and Examples

| Command       | Description                                              | Example                                                                        |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `status`      | Show index freshness, manifest state, and stale reasons. | `veil status --workspace .`                                                    |
| `init`        | Initialize index if missing or stale.                    | `veil init --workspace .`                                                      |
| `build`       | Force full index rebuild for workspace.                  | `veil build --workspace .`                                                     |
| `refresh`     | Incremental index refresh using changed files.           | `veil refresh --workspace . --mode changed`                                    |
| `discover`    | Combined retrieval across files, symbols, and chunks.    | `veil discover --workspace . --query "find build logic"`                       |
| `lookup`      | Intent-aware ranked retrieval with short reasoning.      | `veil lookup --workspace . --query "where is parseNdjson defined"`             |
| `files`       | Search file paths by query.                              | `veil files --workspace . --query "workflow"`                                  |
| `symbols`     | Search symbols (functions, classes, types, methods).     | `veil symbols --workspace . --query "TopKHeap"`                                |
| `search`      | Search indexed content chunks in code or docs.           | `veil search --workspace . --query "pnpm install"`                             |
| `web-search`  | Multi-provider web search with ranked results.           | `veil web-search --query "typescript language server" --limit 5`               |
| `fetch-url`   | Fetch URL content and normalize to markdown or text.     | `veil fetch-url --url https://www.iana.org/domains/reserved --format markdown` |
| `git-status`  | Show branch, dirty tree, and untracked summary.          | `veil git-status --workspace .`                                                |
| `git-log`     | Show recent commits with metadata.                       | `veil git-log --workspace . --limit 10`                                        |
| `git-diff`    | Show working or ranged git diff.                         | `veil git-diff --workspace .`                                                  |
| `git-show`    | Show one git revision with metadata and patch text.      | `veil git-show --workspace . --rev HEAD`                                       |
| `gh-lookup`   | Pull GitHub repo or PR context via `gh` CLI.             | `veil gh-lookup --repo ushiradineth/veil --kind repo_context`                  |
| `diagnostics` | Show cache counters and latency diagnostics.             | `veil diagnostics`                                                             |
| `mcp server`  | Start MCP stdio server runtime.                          | `veil mcp server`                                                              |
