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

- Run directory: `../../../../tmp/veil-bench-cli-violation-payload-qhnZe1/20260323-165110Z`
- Result JSON: `../../../../tmp/veil-bench-cli-violation-payload-qhnZe1/20260323-165110Z/results.json`
- Summary markdown: `../../../../tmp/veil-bench-cli-violation-payload-qhnZe1/20260323-165110Z/SUMMARY.md`
- Generated: `2026-03-23T16:51:21.104Z`
- Workspace: `/Users/shu/Code/veil`
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
| status-bootstrap | 354.2473 / 385.0028 |
| files-homebrew | 520.6439 / 521.2925 |
| symbols-build | 539.1253 / 618.2535 |
| search-pnpm-install | 541.4906 / 619.9764 |
| lookup-build-index | 571.9153 / 650.4433 |
| discover-combined | 538.3642 / 604.4052 |
| git-status-check | 359.8038 / 386.6435 |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 12000 / 333.6784 / 0.00 |
| files-homebrew | 12000 / 520.6439 / 0.00 |
| symbols-build | 12000 / 618.2535 / 0.00 |
| search-pnpm-install | 12000 / 619.9764 / 0.00 |
| lookup-build-index | 12000 / 571.9153 / 0.00 |
| discover-combined | 12000 / 537.1116 / 0.00 |
| git-status-check | 12000 / 348.5208 / 0.00 |

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

