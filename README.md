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
npx -y @ushiradineth/veil@latest status --workspace .
```

## Install Skill

```bash
npx -y skills add https://github.com/ushiradineth/veil/tree/main --skill veil
```

## CLI Examples

```bash
# status and refresh
veil status --workspace .
veil init --workspace .
veil refresh --workspace . --mode changed

# local index retrieval
veil discover --workspace . --query "find build logic"
veil lookup --workspace . --query "where is parseNdjson defined"
veil search --workspace . --query "pnpm install"

# web and fetch
veil web-search --query "typescript language server" --limit 5
veil fetch-url --url https://www.iana.org/domains/reserved --format markdown

# git and github context
veil git-status --workspace .
veil git-log --workspace . --limit 10
veil git-diff --workspace .
veil git-show --workspace . --rev HEAD
veil gh-lookup --repo ushiradineth/veil --kind repo_context

# diagnostics
veil diagnostics

# optional MCP server
veil mcp server

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

Run A/B strategy benchmarks (Veil MCP vs Veil CLI+skill) with competitor cells:

```bash
nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --agents veil,firecrawl --strategies mcp_transport,cli_skill --profile smoke --cold 1 --warm 1
```

## Release

Releases follow a trunk-gated PR promotion flow.

1. Dispatch the `Release` workflow from `main` with a bump type (`patch`, `minor`, `major`).
   This creates a `release/vX.Y.Z` branch and opens a PR to `main`.
2. CI runs on the PR. Merge when checks pass.
3. Merging triggers the `Publish` workflow which tags, publishes to npm, creates a GitHub release,
   and updates the Homebrew formula in the tap repository.

Required GitHub secrets:

| Secret                      | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `NPM_TOKEN`                 | Publish to npm registry                        |
| `RELEASE_PR_TOKEN`          | PAT to open release PR so CI triggers on it    |
| `HOMEBREW_TAP_GITHUB_TOKEN` | PAT with write access to the Homebrew tap repo |

Optional repository variables:

| Variable                | Default                     | Purpose                  |
| ----------------------- | --------------------------- | ------------------------ |
| `HOMEBREW_TAP_REPO`     | `ushiradineth/homebrew-tap` | Tap owner/repo           |
| `HOMEBREW_FORMULA_PATH` | `Formula/veil.rb`           | Formula file path in tap |

Branch protection on `main` should require the `CI / test` check context before merge.
