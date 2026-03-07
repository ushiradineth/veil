# Veil MCP

Veil is a fast MCP server and CLI for local code retrieval. It indexes a repo and exposes focused tools for files, symbols, search, lookup, web research, URL fetch, and git context.

## What It Is For

Veil is built for agents that need to move from prompt to implementation quickly.

It gives the agent indexed access to files, symbols, and relevant code chunks, so it can retrieve precise context before writing code. This reduces broad file reads and repeated text scans, improves token efficiency, and shortens time to first meaningful code change.

In practice, Veil acts as a local retrieval layer for coding agents: discover where code lives, resolve symbols, pull focused context, then execute edits.

## Get Started

Requires Node.js 20 or later.

Add Veil to your MCP client config:

```json
{
  "mcpServers": {
    "veil": {
      "command": "npx",
      "args": ["-y", "@ushiradineth/veil@latest", "server"]
    }
  }
}
```

Install the Veil skill (optional, improves agent tool routing):

```bash
npx -y skills add https://github.com/ushiradineth/veil/tree/main/docs --skill veil --list
```

## MCP Tools

Available Veil MCP tools:

|     | Tool | Description |
| --- | --- | --- |
| - | `status` | Index status and staleness reasons |
| - | `refresh` | Full or changed index refresh |
| - | `files` | File path substring lookup |
| - | `symbols` | Symbol name lookup |
| - | `search` | Indexed code chunk search |
| - | `lookup` | Intent-aware contextual retrieval with explainability |
| - | `discover` | Combined status and focused retrieval in one call |
| - | `web_search` | No-key web search (`google`, `duckduckgo`, `wikipedia`, `github`, `reddit`, `deepwiki`) |
| - | `fetch_url` | Markdown-first URL content fetch |
| - | `git_status` | Branch and workspace state |
| - | `git_log` | Commit history lookup |
| - | `git_diff` | Uncommitted or range diff lookup |
| - | `git_show` | Commit details and optional patch |
| - | `gh_lookup` | GitHub issues, PRs, checks, and repo context bootstrap via `gh` |
| - | `diagnostics` | Cache and latency diagnostics |

## CLI Examples

```bash
# status and refresh
veil cli status --workspace .
veil cli refresh --workspace . --mode changed

# local index retrieval
veil cli discover --workspace . --query "find build logic"
veil cli lookup --workspace . --query "where is parseNdjson defined"

# web and fetch
veil cli web-search --query "typescript language server" --limit 5
veil cli fetch-url --url https://example.com --format markdown

# git and github context
veil cli git-status --workspace .
veil cli git-log --workspace . --limit 10
veil cli git-diff --workspace .
veil cli git-show --workspace . --rev HEAD
veil cli gh-lookup --repo owner/repo --kind issues --query "is:open"

# diagnostics
veil cli diagnostics
```

## MCP Client Configuration

<details>
  <summary>Codex</summary>
  Follow the <a href="https://developers.openai.com/codex/mcp/#configure-with-the-cli">configure MCP guide</a>
  using the standard config from above. You can also install Veil using the Codex CLI:

```bash
codex mcp add veil -- npx -y @ushiradineth/veil@latest server
```

</details>

<details>
  <summary>Claude Code</summary>

Install via CLI:

```bash
claude mcp add --scope user veil -- npx -y @ushiradineth/veil@latest server
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
      "command": ["npx", "-y", "@ushiradineth/veil@latest", "server"]
    }
  }
}
```

</details>

<details>
  <summary>Cursor</summary>

Click to install:

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=veil&config=eyJjb21tYW5kIjoibnB4IC15IEB1c2hpcmFkaW5ldGgvdmVpbEBsYXRlc3Qgc2VydmVyIn0%3D)

Or install manually in `Cursor Settings` -> `MCP` -> `New MCP Server` with:

```json
{
  "mcpServers": {
    "veil": {
      "command": "npx",
      "args": ["-y", "@ushiradineth/veil@latest", "server"]
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
