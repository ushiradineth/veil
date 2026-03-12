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

- Run directory: `benchmarks/results/20260312-020904Z`
- Result JSON: `benchmarks/results/20260312-020904Z/results.json`
- Summary markdown: `benchmarks/results/20260312-020904Z/SUMMARY.md`
- Generated: `2026-03-12T02:14:37.424Z`
- Workspace: `/Users/shu/Code/veil`
- Iterations: `cold=1`, `warm=1`
- Runtime budget: `300000ms`

## Scenario Coverage

| MCP Tool      | Scenario ID             |
| ------------- | ----------------------- |
| `status`      | `status-bootstrap`      |
| `refresh`     | `refresh-changed`       |
| `files`       | `files-homebrew`        |
| `symbols`     | `symbols-build`         |
| `search`      | `search-pnpm-install`   |
| `lookup`      | `lookup-build-index`    |
| `discover`    | `discover-combined`     |
| `web_search`  | `web-search-typescript` |
| `fetch_url`   | `fetch-url-example`     |
| `diagnostics` | `diagnostics-read`      |
| `git_status`  | `git-status-check`      |
| `git_log`     | `git-log-check`         |
| `git_diff`    | `git-diff-check`        |
| `git_show`    | `git-show-head`         |
| `gh_lookup`   | `gh-repo-context`       |

## Warm Latency Comparison (p50 / p95 ms)

| Scenario              | codex (veil)                                                 | codex (serena)                                               | codex (none)                                                 | claude (veil)                              | claude (serena)                            | claude (none)                              | opencode (veil)                            | opencode (serena)                          | opencode (none)                            |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| status-bootstrap      | 14925.5782 / 14925.5782                                      | unsupported: codex timeout                                   | unsupported: codex timeout                                   | 12291.6135 / 12291.6135                    | unsupported: claude timeout                | 14821.7760 / 14821.7760                    | unsupported: opencode timeout              | unsupported: opencode timeout              | unsupported: opencode timeout              |
| refresh-changed       | error: exit status 1: OpenAI Codex v0.114.0 (research pre... | error: exit status 1: OpenAI Codex v0.114.0 (research pre... | error: exit status 1: OpenAI Codex v0.114.0 (research pre... | unsupported: claude timeout                | unsupported: claude timeout                | unsupported: claude timeout                | unsupported: opencode timeout              | unsupported: opencode timeout              | unsupported: opencode timeout              |
| files-homebrew        | error: exit status 1: OpenAI Codex v0.114.0 (research pre... | error: exit status 1: OpenAI Codex v0.114.0 (research pre... | error: exit status 1: OpenAI Codex v0.114.0 (research pre... | unsupported: claude timeout                | unsupported: claude timeout                | unsupported: claude timeout                | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| symbols-build         | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| search-pnpm-install   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| lookup-build-index    | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| discover-combined     | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| web-search-typescript | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| fetch-url-example     | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| diagnostics-read      | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| git-status-check      | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| git-log-check         | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| git-diff-check        | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| git-show-head         | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |
| gh-repo-context       | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded                   | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded | unsupported: suite runtime budget exceeded |

## Preflight

| Competitor        | Ready | Mode Control | Reason                                  |
| ----------------- | ----- | ------------ | --------------------------------------- |
| codex (veil)      | yes   | prompt_only  | mode wiring not exposed by codex CLI    |
| codex (serena)    | yes   | prompt_only  | mode wiring not exposed by codex CLI    |
| codex (none)      | yes   | prompt_only  | mode wiring not exposed by codex CLI    |
| claude (veil)     | yes   | strict       |                                         |
| claude (serena)   | yes   | strict       |                                         |
| claude (none)     | yes   | strict       |                                         |
| opencode (veil)   | yes   | prompt_only  | mode wiring not exposed by opencode CLI |
| opencode (serena) | yes   | prompt_only  | mode wiring not exposed by opencode CLI |
| opencode (none)   | yes   | prompt_only  | mode wiring not exposed by opencode CLI |

## Native Choice Signals (first_call_success / calls_to_useful_context / non_veil_fallback_rate)

| Scenario              | codex (veil)       | codex (serena)     | codex (none)       | claude (veil)      | claude (serena)    | claude (none)      | opencode (veil)    | opencode (serena)  | opencode (none)    |
| --------------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| status-bootstrap      | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 1.00 / 1.00 / 0.00 | 0.00 / 3.00 / 1.00 | 1.00 / 2.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| refresh-changed       | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| files-homebrew        | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| symbols-build         | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| search-pnpm-install   | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| lookup-build-index    | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| discover-combined     | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| web-search-typescript | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| fetch-url-example     | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| diagnostics-read      | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-status-check      | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-log-check         | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-diff-check        | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| git-show-head         | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |
| gh-repo-context       | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 | 0.00 / 3.00 / 1.00 |

Notes:

- Web and GitHub scenarios are network dependent and usually much slower than local index queries.
- Cells with `unsupported` or `error` indicate that competitor/mode could not execute that scenario.
