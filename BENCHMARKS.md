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

- Run directory: `../../../../../tmp/veil-bench-cli-violation-payload-1xk7N2/20260323-173327Z`
- Result JSON: `../../../../../tmp/veil-bench-cli-violation-payload-1xk7N2/20260323-173327Z/results.json`
- Summary markdown: `../../../../../tmp/veil-bench-cli-violation-payload-1xk7N2/20260323-173327Z/SUMMARY.md`
- Generated: `2026-03-23T17:33:37.316Z`
- Workspace: `/Users/shu/Code/veil-worktrees/mcp-skill-outdated-notify`
- Profile: `smoke`
- Agents: `veil`
- Strategies: `mcp_transport`
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

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 329.2428 / 339.3690 |
| files-homebrew | 509.4365 / 529.9148 |
| symbols-build | 517.8782 / 518.1286 |
| search-pnpm-install | 525.5576 / 556.0970 |
| lookup-build-index | 516.8617 / 532.6467 |
| discover-combined | 516.2470 / 534.7299 |
| git-status-check | 336.2799 / 345.8327 |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 12000 / 339.3690 / 0.00 |
| files-homebrew | 12000 / 498.7159 / 0.00 |
| symbols-build | 12000 / 518.1286 / 0.00 |
| search-pnpm-install | 12000 / 500.5409 / 0.00 |
| lookup-build-index | 12000 / 511.8552 / 0.00 |
| discover-combined | 12000 / 534.7299 / 0.00 |
| git-status-check | 12000 / 334.8785 / 0.00 |

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
| search-pnpm-install | 1.00 / 1.00 / 0.00 |
| lookup-build-index | 1.00 / 1.00 / 0.00 |
| discover-combined | 1.00 / 1.00 / 0.00 |
| git-status-check | 1.00 / 1.00 / 0.00 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.
