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

- Run directory: `benchmarks/results/20260312-163035Z`
- Result JSON: `benchmarks/results/20260312-163035Z/results.json`
- Summary markdown: `benchmarks/results/20260312-163035Z/SUMMARY.md`
- Generated: `2026-03-12T16:30:40.144Z`
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
| status-bootstrap | 278.2771 / 278.2771 | 211.1512 / 211.1512 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| files-homebrew | 293.9072 / 293.9072 | 247.5804 / 247.5804 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| symbols-build | 305.8332 / 305.8332 | 246.5070 / 246.5070 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| search-pnpm-install | 302.8813 / 302.8813 | 235.5865 / 235.5865 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| lookup-build-index | 307.8387 / 307.8387 | 237.4309 / 237.4309 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| discover-combined | 299.2090 / 299.2090 | 249.4950 / 249.4950 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| git-status-check | 313.7513 / 313.7513 | 251.3912 / 251.3912 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) | veil (cli_skill) | firecrawl (mcp_transport) | firecrawl (cli_skill) |
| --- | --- | --- | --- | --- |
| status-bootstrap | 12000 / 278.2771 / 1.00 | 400 / 211.1512 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| files-homebrew | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| symbols-build | 12000 / 305.8332 / 1.00 | 400 / 246.5070 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| search-pnpm-install | 12000 / 302.8813 / 1.00 | 400 / 235.5865 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| lookup-build-index | 12000 / 307.8387 / 1.00 | 400 / 237.4309 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| discover-combined | 12000 / 299.2090 / 1.00 | 400 / 249.4950 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| git-status-check | 12000 / 313.7513 / 1.00 | 400 / 251.3912 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |

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
| files-homebrew | 1.00 / 2.00 / 1.00 | 1.00 / 2.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| symbols-build | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| search-pnpm-install | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| lookup-build-index | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| discover-combined | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-status-check | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.

