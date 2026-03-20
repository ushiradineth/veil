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

- Run directory: `benchmarks/results/20260319-121814Z`
- Result JSON: `benchmarks/results/20260319-121814Z/results.json`
- Summary markdown: `benchmarks/results/20260319-121814Z/SUMMARY.md`
- Generated: `2026-03-19T12:18:18.751Z`
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
| status-bootstrap | 395.9953 / 395.9953 |
| files-homebrew | 640.8661 / 640.8661 |
| symbols-build | 599.2184 / 599.2184 |
| search-pnpm-install | 596.0915 / 596.0915 |
| lookup-build-index | 608.3995 / 608.3995 |
| discover-combined | 656.0138 / 656.0138 |
| git-status-check | 354.2710 / 354.2710 |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) |
| --- | --- |
| status-bootstrap | 12000 / 395.9953 / 0.00 |
| files-homebrew | 12000 / 640.8661 / 0.00 |
| symbols-build | 12000 / 599.2184 / 0.00 |
| search-pnpm-install | 12000 / 596.0915 / 0.00 |
| lookup-build-index | 12000 / 608.3995 / 0.00 |
| discover-combined | 12000 / 656.0138 / 0.00 |
| git-status-check | 12000 / 354.2710 / 0.00 |

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

