# Benchmarks

Auto-generated from the newest benchmark run.

## Quick Run

Start MCP server:

```bash
nix run nixpkgs#bun -- run src/bin.ts
```

Run benchmark suite:

```bash
nix run nixpkgs#bun -- run src/bench-suite.ts --workspace /path/to/repo --profile smoke --cold 1 --warm 1
```

## Latest Run

- Run directory: `benchmarks/results/20260323-162024Z`
- Result JSON: `benchmarks/results/20260323-162024Z/results.json`
- Summary markdown: `benchmarks/results/20260323-162024Z/SUMMARY.md`
- Generated: `2026-03-23T16:20:40.538Z`
- Workspace: `/Users/shu/Code/veil`
- Profile: `smoke`
- Agents: `veil`
- Strategies: `mcp_transport`
- Iterations: `cold=1`, `warm=5`
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

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 351.5163 / 412.5676 |
| files-homebrew | 454.1285 / 656.0840 |
| symbols-build | 548.6772 / 738.5630 |
| search-pnpm-install | 461.6388 / 485.3905 |
| lookup-build-index | 480.2447 / 559.1512 |
| discover-combined | 479.9609 / 482.2489 |
| git-status-check | 370.5032 / 406.1030 |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 12000 / 412.5676 / 0.00 |
| files-homebrew | 12000 / 656.0840 / 0.00 |
| symbols-build | 12000 / 481.1573 / 0.00 |
| search-pnpm-install | 12000 / 0.0000 / 0.00 |
| lookup-build-index | 12000 / 480.2447 / 0.00 |
| discover-combined | 12000 / 482.2489 / 0.00 |
| git-status-check | 12000 / 406.1030 / 0.00 |

## Preflight

| Competitor | Ready | Mode Control | Reason |
| --- | --- | --- | --- |
| veil (mcp_transport) | yes | strict | local veil MCP stdio transport |

## Native Choice Signals (first_call_success / calls_to_useful_context / non_veil_fallback_rate)

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 1.00 / 1.00 / 0.00 |
| files-homebrew | 1.00 / 1.00 / 0.00 |
| symbols-build | 1.00 / 1.00 / 0.00 |
| search-pnpm-install | 1.00 / 2.00 / 0.00 |
| lookup-build-index | 1.00 / 1.00 / 0.00 |
| discover-combined | 1.00 / 1.00 / 0.00 |
| git-status-check | 1.00 / 1.00 / 0.00 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.

