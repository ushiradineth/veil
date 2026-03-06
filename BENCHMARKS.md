# Benchmarks

Simple benchmark guide for this repo.

## Quick Run

Build or refresh index:

```bash
nix run nixpkgs#bun -- run src/cli.ts refresh --workspace /path/to/repo --mode changed
```

Run benchmark suite:

```bash
nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --cold 1 --warm 10 --out benchmarks/results/latest
```

## Output Files

- `benchmarks/results/latest/results.json`
- `benchmarks/results/latest/SUMMARY.md`

Use `results.json` as source of truth for any published numbers.

## Scenario Coverage

The suite executes all current Veil MCP tools.

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
| `gh_lookup` | `gh-lookup-prs` |

## Latest Quick Snapshot

Source: `benchmarks/results/latest/results.json`

- Generated: `2026-03-04T15:50:29.797Z`
- Workspace: `/Users/shu/Code/veil`
- Iterations: `cold=1`, `warm=10`

Veil warm latency highlights:

| Scenario | Warm p50 (ms) | Warm p95 (ms) |
| --- | ---: | ---: |
| status-bootstrap | 0.0018 | 0.0158 |
| refresh-changed | 72.6088 | 115.5082 |
| files-homebrew | 0.0353 | 0.0907 |
| symbols-build | 0.0345 | 0.0583 |
| search-pnpm-install | 0.0791 | 0.0967 |
| lookup-build-index | 0.1833 | 0.2395 |
| discover-combined | 0.1002 | 0.8553 |
| web-search-typescript | 1285.7768 | 1617.4911 |
| fetch-url-example | 55.6339 | 70.1281 |
| diagnostics-read | 0.0671 | 0.1171 |
| git-status-check | 38.3418 | 42.3217 |
| git-log-check | 16.7118 | 17.4411 |
| git-diff-check | 17.1298 | 17.3150 |
| git-show-head | 19.8787 | 22.1407 |
| gh-lookup-prs | 1644.7691 | 2334.9696 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Some competitor rows are intentionally `unsupported` when there is no equivalent tool mapping.
