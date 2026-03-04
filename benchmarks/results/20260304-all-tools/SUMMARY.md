# Benchmark Suite Result

Generated: 2026-03-04T15:50:29.797Z
Workspace: /Users/shu/Code/veil
Iterations: cold=1, warm=10

## Environment

- Platform: darwin (arm64)
- Node: v24.3.0
- Bun: 1.3.3
- CPU: Apple M2 Pro (10 cores)

## Results

| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |
|------------|----------|---------------|---------------|---------|-----------|--------|
| Veil MCP index | Repository status bootstrap | 0.0018 | 0.0158 | 1.00 | 1.00 | ok |
| Veil MCP index | Incremental index refresh | 72.6088 | 115.5082 | 1.00 | 1.00 | ok |
| Veil MCP index | File lookup by path intent | 0.0353 | 0.0907 | 1.00 | 0.00 | ok |
| Veil MCP index | Symbol lookup by name intent | 0.0345 | 0.0583 | 1.00 | 0.33 | ok |
| Veil MCP index | Code content lookup | 0.0791 | 0.0967 | 1.00 | 1.00 | ok |
| Veil MCP index | Intent-aware lookup | 0.1833 | 0.2395 | 1.00 | 1.00 | ok |
| Veil MCP index | Combined discovery workflow | 0.1002 | 0.8553 | 1.00 | 1.00 | ok |
| Veil MCP index | Web search query | 1285.7768 | 1617.4911 | 1.00 | 1.00 | ok |
| Veil MCP index | URL fetch markdown-first | 55.6339 | 70.1281 | 1.00 | 1.00 | ok |
| Veil MCP index | Diagnostics lookup | 0.0671 | 0.1171 | 1.00 | 1.00 | ok |
| Veil MCP index | Git status lookup | 38.3418 | 42.3217 | 1.00 | 0.67 | ok |
| Veil MCP index | Git log lookup | 16.7118 | 17.4411 | 1.00 | 0.67 | ok |
| Veil MCP index | Git diff lookup | 17.1298 | 17.3150 | 1.00 | 1.00 | ok |
| Veil MCP index | Git show lookup | 19.8787 | 22.1407 | 1.00 | 1.00 | ok |
| Veil MCP index | GitHub lookup | 1644.7691 | 2334.9696 | 1.00 | 0.50 | ok |
| Shell tool workflow (Claude/Codex baseline) | Repository status bootstrap | 26.5697 | 30.2601 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no index refresh equivalent in shell baseline |
| Shell tool workflow (Claude/Codex baseline) | File lookup by path intent | 18.8313 | 19.8810 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Symbol lookup by name intent | 8.4820 | 9.8246 | 1.00 | 0.33 | ok |
| Shell tool workflow (Claude/Codex baseline) | Code content lookup | 6.4115 | 7.8009 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Intent-aware lookup | 6.0844 | 6.7513 | 1.00 | 0.67 | ok |
| Shell tool workflow (Claude/Codex baseline) | Combined discovery workflow | 86.5006 | 91.5513 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no equivalent tool in shell baseline |
| Shell tool workflow (Claude/Codex baseline) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no equivalent tool in shell baseline |
| Shell tool workflow (Claude/Codex baseline) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no equivalent tool in shell baseline |
| Shell tool workflow (Claude/Codex baseline) | Git status lookup | 8.5278 | 8.9618 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Git log lookup | 8.2317 | 9.2637 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Git diff lookup | 8.8890 | 10.0507 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Git show lookup | 8.4225 | 8.9541 | 1.00 | 0.67 | ok |
| Shell tool workflow (Claude/Codex baseline) | GitHub lookup | 811.8979 | 6887.3257 | 1.00 | 0.45 | ok |
| Serena | Repository status bootstrap | 169.9207 | 172.0778 | 1.00 | 0.00 | ok |
| Serena | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no direct refresh equivalent in Serena adapter |
| Serena | File lookup by path intent | 111.3771 | 114.7167 | 1.00 | 0.00 | ok |
| Serena | Symbol lookup by name intent | 114.8793 | 118.1812 | 1.00 | 0.33 | ok |
| Serena | Code content lookup | 125.1463 | 128.5047 | 1.00 | 1.00 | ok |
| Serena | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'lookup' |
| Serena | Combined discovery workflow | 349.5206 | 374.3070 | 1.00 | 1.00 | ok |
| Serena | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'web_search' |
| Serena | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'fetch_url' |
| Serena | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'diagnostics' |
| Serena | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_status' |
| Serena | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_log' |
| Serena | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_diff' |
| Serena | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_show' |
| Serena | GitHub lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'gh_lookup' |
