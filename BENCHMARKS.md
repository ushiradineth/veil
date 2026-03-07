# Benchmarks

Auto-generated from the newest benchmark run.

## Quick Run

Build or refresh index:

```bash
nix run nixpkgs#bun -- run src/cli.ts refresh --workspace /path/to/repo --mode changed
```

Run benchmark suite:

```bash
nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --cold 1 --warm 10
```

## Latest Run

- Run directory: `benchmarks/results/20260307-122121Z`
- Result JSON: `benchmarks/results/20260307-122121Z/results.json`
- Summary markdown: `benchmarks/results/20260307-122121Z/SUMMARY.md`
- Generated: `2026-03-07T12:23:31.087Z`
- Workspace: `/Users/shu/Code/veil`
- Iterations: `cold=1`, `warm=1`

## Scenario Coverage

| MCP Tool | Scenario ID |
| --- | --- |
| `status` | `status-bootstrap` |
| `refresh` | `refresh-changed` |
| `files` | `files-homebrew` |
| `symbols` | `symbols-build` |
| `search` | `search-pnpm-install` |
| `lookup` | `lookup-build-index` |
| `discover` | `discover-combined` |
| `web_search` | `web-search-typescript` |
| `fetch_url` | `fetch-url-example` |
| `diagnostics` | `diagnostics-read` |
| `git_status` | `git-status-check` |
| `git_log` | `git-log-check` |
| `git_diff` | `git-diff-check` |
| `git_show` | `git-show-head` |
| `gh_lookup` | `gh-repo-context` |

## Warm Latency Comparison (p50 / p95 ms)

| Scenario | codex (veil) | codex (serena) | codex (none) | claude (veil) | claude (serena) | claude (none) | opencode (veil) | opencode (serena) | opencode (none) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| status-bootstrap | error | error | error | error | error | error | unsupported | unsupported | unsupported |
| refresh-changed | error | error | error | error | error | error | unsupported | unsupported | unsupported |
| files-homebrew | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| symbols-build | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| search-pnpm-install | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| lookup-build-index | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| discover-combined | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| web-search-typescript | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| fetch-url-example | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| diagnostics-read | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| git-status-check | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| git-log-check | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| git-diff-check | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| git-show-head | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |
| gh-repo-context | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.

