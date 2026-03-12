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

- Run directory: `benchmarks/results/20260312-132823Z`
- Result JSON: `benchmarks/results/20260312-132823Z/results.json`
- Summary markdown: `benchmarks/results/20260312-132823Z/SUMMARY.md`
- Generated: `2026-03-12T13:28:43.596Z`
- Workspace: `/Users/shu/Code/veil`
- Profile: `smoke`
- Agents: `codex`
- Strategies: `mcp_baseline,cli_skill`
- Iterations: `cold=1`, `warm=1`
- Runtime budget: `20000ms`
- Cell budget: `5000ms`

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

| Scenario | codex (mcp_baseline) | codex (cli_skill) |
| --- | --- | --- |
| status-bootstrap | unsupported: codex timeout | unsupported: codex timeout |
| files-homebrew | unsupported: codex timeout | unsupported: codex timeout |
| symbols-build | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| search-pnpm-install | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| lookup-build-index | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| discover-combined | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| git-status-check | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |

## A/B Signals (schema_overhead_tokens / first_useful_action_ms / fallback_rate)

| Scenario | codex (mcp_baseline) | codex (cli_skill) |
| --- | --- | --- |
| status-bootstrap | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| files-homebrew | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| symbols-build | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| search-pnpm-install | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| lookup-build-index | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| discover-combined | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |
| git-status-check | 12000 / 0.0000 / 1.00 | 400 / 0.0000 / 1.00 |

## Preflight

| Competitor | Ready | Mode Control | Reason |
| --- | --- | --- | --- |
| codex (mcp_baseline) | yes | prompt_only | strategy wiring controlled via benchmark prompts |
| codex (cli_skill) | yes | prompt_only | strategy wiring controlled via benchmark prompts |

## Native Choice Signals (first_call_success / calls_to_useful_context / non_veil_fallback_rate)

| Scenario | codex (mcp_baseline) | codex (cli_skill) |
| --- | --- | --- |
| status-bootstrap | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| files-homebrew | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| symbols-build | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| search-pnpm-install | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| lookup-build-index | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| discover-combined | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-status-check | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.

