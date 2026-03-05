# veil

Veil is a fast MCP server and CLI for local code retrieval. It indexes a repo and exposes focused tools for files, symbols, search, lookup, web research, URL fetch, and git context.

## 2-minute setup

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

Then restart your MCP client.

## MCP config snippets

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "veil": {
      "command": "npx",
      "args": ["-y", "@ushiradineth/veil@latest", "server"],
      "env": {}
    }
  }
}
```

Codex (`~/.config/codex/mcp.json`) and OpenCode (`~/.config/opencode/mcp.json`):

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

Optional Bun launcher:

```json
{
  "mcpServers": {
    "veil": {
      "command": "bunx",
      "args": ["@ushiradineth/veil", "server"]
    }
  }
}
```

Local clone launcher:

```json
{
  "mcpServers": {
    "veil": {
      "command": "bun",
      "args": ["run", "/path/to/veil/src/server.ts"]
    }
  }
}
```

## Quick verification

Package path:

```bash
npx -y @ushiradineth/veil@latest cli status
```

Local clone path:

```bash
node bin/veil.mjs cli status
```

Build and query a workspace:

```bash
npx -y @ushiradineth/veil@latest cli refresh --workspace ~/nix-config --mode full
npx -y @ushiradineth/veil@latest cli discover --workspace ~/nix-config --query "where is buildIndex defined"
```

If you run these commands from inside a local `veil` clone, keep `@latest` in the package spec so npm does not resolve to the local workspace package.

## Agent skill install (`veil`)

Install and list from local path:

```bash
npx -y skills add ./docs --skill veil --list
```

Install and list from GitHub path:

```bash
npx -y skills add https://github.com/ushiradineth/veil/tree/main/docs --skill veil --list
```

Note: this command reflects the current `main` branch contents on GitHub.

Optional agent targeting:

```bash
npx -y skills add https://github.com/ushiradineth/veil/tree/main/docs --skill veil -a opencode
```

## Integration checklist

- `veil` server starts in your MCP client
- `status` returns index metadata
- `discover` returns relevant repo hits
- local `skills ... --list` shows `veil`
- Routing guidance is loaded from `docs/SKILL.md`

## MCP tools

- `status`: index status and staleness reasons
- `refresh`: full or changed index refresh
- `files`: file path substring lookup
- `symbols`: symbol name lookup
- `search`: indexed code chunk search
- `lookup`: intent-aware contextual retrieval with explainability
- `discover`: combined status and focused retrieval in one call
- `web_search`: no-key web search (google, duckduckgo, wikipedia, github, reddit, deepwiki)
- `fetch_url`: markdown-first URL content fetch
- `git_status`: branch and workspace state
- `git_log`: commit history lookup
- `git_diff`: uncommitted or range diff lookup
- `git_show`: commit details and optional patch
- `gh_lookup`: GitHub issues, PRs, and checks via `gh`
- `diagnostics`: cache and latency diagnostics

## Release workflow

- Workflow: `.github/workflows/release.yml` (`workflow_dispatch`)
- Inputs: `version_bump` (`patch|minor|major`) and `dry_run` (`true|false`)
- Guardrails: release runs only from default branch and requires `package.json` version to match latest semver tag (`vX.Y.Z`) before bump
- Outputs: updates `package.json` and `CHANGELOG.md`, tags `v<version>`, publishes npm package, and creates GitHub release
- Release notes: generated via GitHub release notes config in `.github/release.yml` with changelog fallback so release pages are never empty
- Required secret: `NPM_TOKEN` for npm publish (`GITHUB_TOKEN` is provided by Actions)

## Links

- Benchmark methodology and latest artifacts: `BENCHMARKS.md`
- Agent routing policy: `AGENTS.md`
- Reusable routing skill: `docs/SKILL.md`
- License: `LICENSE`
