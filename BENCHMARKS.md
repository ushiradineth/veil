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

- Run directory: `benchmarks/results/20260316-201305Z`
- Result JSON: `benchmarks/results/20260316-201305Z/results.json`
- Summary markdown: `benchmarks/results/20260316-201305Z/SUMMARY.md`
- Generated: `2026-03-16T20:13:10.629Z`
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
| status-bootstrap | 365.7860 / 365.7860 | 266.8455 / 266.8455 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| files-homebrew | 345.1810 / 345.1810 | 277.1895 / 277.1895 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| symbols-build | 341.7818 / 341.7818 | 290.8063 / 290.8063 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| search-pnpm-install | 360.3892 / 360.3892 | 278.6475 / 278.6475 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| lookup-build-index | 370.5873 / 370.5873 | 270.4212 / 270.4212 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| discover-combined | 436.5554 / 436.5554 | 325.9891 / 325.9891 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |
| git-status-check | 399.7720 / 399.7720 | 578.6643 / 578.6643 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP | unsupported: firecrawl unavailable: Executable not found ... |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | veil (mcp_transport) | veil (cli_skill) | firecrawl (mcp_transport) | firecrawl (cli_skill) |
| --- | --- | --- | --- | --- |
| status-bootstrap | 12000 / 365.7860 / 1.00 | 400 / 266.8455 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| files-homebrew | 12000 / 345.1810 / 1.00 | 400 / 277.1895 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| symbols-build | 12000 / 341.7818 / 1.00 | 400 / 290.8063 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| search-pnpm-install | 12000 / 360.3892 / 1.00 | 400 / 278.6475 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| lookup-build-index | 12000 / 370.5873 / 1.00 | 400 / 270.4212 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| discover-combined | 12000 / 436.5554 / 1.00 | 400 / 325.9891 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| git-status-check | 12000 / 399.7720 / 1.00 | 400 / 578.6643 / 0.00 | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |

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

