# Veil CLI

Veil is a fast CLI and skill for local code retrieval and agent context workflows.

It indexes a repository and provides focused commands for files, symbols, semantic lookup,
web/fetch context, and git or GitHub reads.

## What It Is For

Veil is built for agent workflows that need fast, token-lean context before editing code.

- Start broad with `discover`
- Narrow with `lookup`, `search`, `files`, or `symbols`
- Use built-in git and web commands instead of ad hoc shell fallbacks

## Install

Requires Node.js 20 or later.

```bash
npm i -g @ushiradineth/veil
```

Or run without install:

```bash
npx -y @ushiradineth/veil@latest cli status --workspace .
```

## Install Skill

```bash
npx -y skills add https://github.com/ushiradineth/veil/tree/main --skill veil
```

## CLI Examples

```bash
# status and refresh
veil cli status --workspace .
veil cli init --workspace .
veil cli refresh --workspace . --mode changed

# local index retrieval
veil cli discover --workspace . --query "find build logic"
veil cli lookup --workspace . --query "where is parseNdjson defined"
veil cli search --workspace . --query "pnpm install"

# web and fetch
veil cli web-search --query "typescript language server" --limit 5
veil cli fetch-url --url https://www.iana.org/domains/reserved --format markdown

# git and github context
veil cli git-status --workspace .
veil cli git-log --workspace . --limit 10
veil cli git-diff --workspace .
veil cli git-show --workspace . --rev HEAD
veil cli gh-lookup --repo ushiradineth/veil --kind repo_context

# diagnostics
veil cli diagnostics
```

## Commands

- `status`, `init`, `refresh`
- `discover`, `lookup`, `files`, `symbols`, `search`
- `web-search`, `fetch-url`
- `git-status`, `git-log`, `git-diff`, `git-show`, `gh-lookup`
- `diagnostics`

## Development Commands

```bash
nix run nixpkgs#bun -- install
nix run nixpkgs#bun -- run lint
nix run nixpkgs#bun -- test ./src/test.ts
```

## Benchmark A/B

Run A/B strategy benchmarks (MCP baseline prompt strategy vs CLI+skill strategy):

```bash
nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --strategies mcp_baseline,cli_skill --profile smoke --cold 1 --warm 1
```
