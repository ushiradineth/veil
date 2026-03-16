# Veil Agent Toolkit

Veil helps coding agents find the right code fast.

Without Veil, agents often:

- search too many files
- guess where symbols are
- repeat the same scans after each change

With Veil, agents can:

- use `discover` to get files, symbols, and code chunks in one step
- use `lookup` to get the most relevant context for the task
- use `files`, `symbols`, and `search` for focused follow-up
- use built-in git and web tools instead of ad hoc shell commands

Agents should:

- Start broad with `discover`
- Narrow with `lookup`, `search`, `files`, or `symbols`
- Use built-in git and web commands instead of ad hoc shell fallbacks

## What It Is For

Veil is built for agents that need to move from prompt to implementation quickly.

It gives the agent indexed access to files, symbols, and relevant code chunks, so it can retrieve precise context before writing code. This reduces broad file reads and repeated text scans, improves token efficiency, and shortens time to first meaningful code change.

In practice, Veil acts as a local retrieval layer for coding agents: discover where code lives, resolve symbols, pull focused context, then execute edits.

## Setup

### Initialize using the CLI (recommended)

```bash
npx -y @ushiradineth/veil@latest init
```

### Setup manually

#### Install the CLI

Package managers:

```bash
npm i -g @ushiradineth/veil
pnpm add -g @ushiradineth/veil
yarn global add @ushiradineth/veil
bun add -g @ushiradineth/veil
```

Homebrew:

```bash
brew tap ushiradineth/homebrew https://github.com/ushiradineth/homebrew
brew install veil
```

#### Install the Skill (based on your preference)

CLI skill:

```bash
npx -y skills add https://github.com/ushiradineth/veil --skill veil-cli
```

MCP skill:

```bash
npx -y skills add https://github.com/ushiradineth/veil --skill veil-mcp
```

### MCP Client Configuration

<details>
  <summary>Codex</summary>
  Follow the <a href="https://developers.openai.com/codex/mcp/#configure-with-the-cli">configure MCP guide</a>
  using the standard config from above. You can also install Veil using the Codex CLI:

```bash
codex mcp add veil -- npx -y @ushiradineth/veil@latest mcp server
```

</details>

<details>
  <summary>Claude Code</summary>

Install via CLI:

```bash
claude mcp add --scope user veil -- npx -y @ushiradineth/veil@latest mcp server
```

See the <a href="https://code.claude.com/docs/en/mcp">Claude Code MCP guide</a> for more details.

</details>

<details>
  <summary>OpenCode</summary>

Add the following configuration to your `opencode.json` file. If you do not have one, create it at `~/.config/opencode/opencode.json` (<a href="https://opencode.ai/docs/mcp-servers">guide</a>):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "veil": {
      "type": "local",
      "command": ["npx", "-y", "@ushiradineth/veil@latest", "mcp", "server"]
    }
  }
}
```

</details>

<details>
  <summary>Cursor</summary>

Click to install:

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=veil&config=eyJjb21tYW5kIjoibnB4IC15IEB1c2hpcmFkaW5ldGgvdmVpbEBsYXRlc3QgbWNwIHNlcnZlciJ9)

Or install manually in `Cursor Settings` -> `MCP` -> `New MCP Server` with:

```json
{
  "mcpServers": {
    "veil": {
      "command": "npx",
      "args": ["-y", "@ushiradineth/veil@latest", "mcp", "server"]
    }
  }
}
```

</details>

<details>
  <summary>Windsurf</summary>
  Follow the <a href="https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json">configure MCP guide</a>
  using the standard config from above.
</details>

## Capabilities

If index build fails with `Missing required parser runtimes for enabled built-ins`, reinstall dependencies (`bun install` or `npm install`) and rerun `veil init` parser setup. In read-only environments, ensure `tree-sitter` runtime artifacts are available before running `build` or `refresh`.

Use the same retrieval and context capability surface from either CLI or MCP.

MCP breaking change: canonical tool names are now prefixed with `veil_` and compatibility aliases were removed.

MCP responses are TOON text only and optimized for compact machine parsing. Guidance is included only when confidence is not high/full. Retrieval tools (`discover`, `lookup`, `search`) return compact chunk content by default, and full chunk content is opt-in (`--include-content` / `include_content`).

| Capability                           | What it does                                                          | CLI command                                              | MCP tool           |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| Index status                         | Shows index freshness, manifest health, and stale reasons.            | `veil status --workspace .`                              | `veil_status`      |
| Incremental index refresh            | Rebuilds index records from changed files only.                       | `veil refresh --workspace . --mode changed`              | `veil_refresh`     |
| Discover files, symbols, chunks      | Returns a mixed set of high-signal retrieval context in one call.     | `veil discover --workspace . --query "<query>"`          | `veil_discover`    |
| Targeted chunk fetch                 | Fetches full content for one chunk id after compact retrieval.        | `veil chunk --workspace . --id <chunk-id>`               | `veil_chunk`       |
| Intent-aware ranked lookup           | Ranks relevant context with intent-aware scoring for coding tasks.    | `veil lookup --workspace . --query "<query>"`            | `veil_lookup`      |
| File path retrieval                  | Finds matching file paths for quick navigation.                       | `veil files --workspace . --query "<query>"`             | `veil_files`       |
| Symbol retrieval                     | Finds functions, classes, types, and methods by name.                 | `veil symbols --workspace . --query "<query>"`           | `veil_symbols`     |
| Content search                       | Searches indexed code and docs chunks by query.                       | `veil search --workspace . --query "<query>"`            | `veil_search`      |
| Web search                           | Runs multi-provider web search for external context.                  | `veil web-search --query "<query>"`                      | `veil_web_search`  |
| URL fetch and markdown normalization | Fetches web content and normalizes output for agent-friendly reading. | `veil fetch-url --url <url> --format markdown`           | `veil_fetch_url`   |
| Git status                           | Shows branch state, dirty files, and untracked changes.               | `veil git-status --workspace .`                          | `veil_git_status`  |
| Git log                              | Returns recent commits with metadata for project history checks.      | `veil git-log --workspace . --limit 10`                  | `veil_git_log`     |
| Git diff                             | Returns working tree or revision-range diffs.                         | `veil git-diff --workspace .`                            | `veil_git_diff`    |
| Git show                             | Shows full details for a specific revision.                           | `veil git-show --workspace . --rev HEAD`                 | `veil_git_show`    |
| GitHub context lookup                | Pulls repository or pull request context via `gh` integration.        | `veil gh-lookup --repo <owner/repo> --kind repo_context` | `veil_gh_lookup`   |
| Runtime diagnostics                  | Surfaces cache counters and latency diagnostics.                      | `veil diagnostics`                                       | `veil_diagnostics` |
