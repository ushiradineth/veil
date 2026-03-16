# Benchmarks

Auto-generated from the newest benchmark run.

## Quick Run

Build or refresh index:

```bash
nix run nixpkgs#bun -- run src/cli.ts refresh --workspace /path/to/repo --mode changed
```

Run benchmark suite:

```bash
nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --profile smoke --cold 1 --warm 1
```

## Latest Run

- Run directory: `benchmarks/results/20260316-103430Z`
- Result JSON: `benchmarks/results/20260316-103430Z/results.json`
- Summary markdown: `benchmarks/results/20260316-103430Z/SUMMARY.md`
- Generated: `2026-03-16T10:34:35.478Z`
- Workspace: `/Users/shu/Code/veil`
- Profile: `smoke`
- Agents: `veil,firecrawl`
- Strategies: `mcp_transport,cli_skill`
- Iterations: `cold=1`, `warm=1`
- Runtime budget: `120000ms`
- Cell budget: `20000ms`

## Scenario Coverage

| Tool Family | Scenario ID |
| --- | --- |
| `status` | `status-bootstrap` |
| `files` | `files-homebrew` |
| `symbols` | `symbols-build` |
| `search` | `search-pnpm-install` |
| `lookup` | `lookup-build-index` |
| `discover` | `discover-combined` |
| `git_status` | `git-status-check` |

## Warm Latency Comparison (p50 / p95 ms)

| Scenario | veil (mcp_transport) | veil (cli_skill) | firecrawl (mcp_transport) | firecrawl (cli_skill) |
| --- | --- | --- | --- | --- |
| status-bootstrap | 334.6200 / 334.6200 | 259.0540 / 259.0540 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| files-homebrew | 328.6357 / 328.6357 | 259.3834 / 259.3834 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| symbols-build | 331.4048 / 331.4048 | 265.1192 / 265.1192 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| search-pnpm-install | 342.9068 / 342.9068 | 271.4266 / 271.4266 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| lookup-build-index | 342.9462 / 342.9462 | 256.4105 / 256.4105 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| discover-combined | 347.8771 / 347.8771 | 283.7451 / 283.7451 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| git-status-check | 342.8333 / 342.8333 | 282.4903 / 282.4903 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) | veil (cli_skill) | firecrawl (mcp_transport) | firecrawl (cli_skill) |
| --- | --- | --- | --- | --- |
| status-bootstrap | 12000 / 334.6200 / 1.00 | 400 / 259.0540 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| files-homebrew | 12000 / 328.6357 / 1.00 | 400 / 259.3834 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| symbols-build | 12000 / 331.4048 / 1.00 | 400 / 265.1192 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| search-pnpm-install | 12000 / 342.9068 / 1.00 | 400 / 271.4266 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| lookup-build-index | 12000 / 342.9462 / 1.00 | 400 / 256.4105 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| discover-combined | 12000 / 347.8771 / 1.00 | 400 / 283.7451 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| git-status-check | 12000 / 342.8333 / 1.00 | 400 / 282.4903 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |

## Preflight

| Competitor | Ready | Mode Control | Reason |
| --- | --- | --- | --- |
| veil (mcp_transport) | yes | strict | local veil MCP stdio transport |
| veil (cli_skill) | yes | strict | local veil CLI execution |
| firecrawl (mcp_transport) | no | strict | missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (cli_skill) | no | strict | firecrawl unavailable: Executable not found in $PATH: "firecrawl" |

## Native Choice Signals (first_call_success / calls_to_useful_context / non_veil_fallback_rate)

| Scenario | veil (mcp_transport) | veil (cli_skill) | firecrawl (mcp_transport) | firecrawl (cli_skill) |
| --- | --- | --- | --- | --- |
| status-bootstrap | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| files-homebrew | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| symbols-build | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| search-pnpm-install | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| lookup-build-index | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| discover-combined | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-status-check | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.

