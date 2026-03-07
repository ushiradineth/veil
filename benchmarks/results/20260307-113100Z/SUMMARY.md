# Benchmark Suite Result

Generated: 2026-03-07T11:32:24.215Z
Workspace: /Users/shu/Code/veil
Iterations: cold=1, warm=1

## Environment

- Platform: darwin (arm64)
- Node: v24.3.0
- Bun: 1.3.3
- CPU: Apple M2 Pro (10 cores)

## Results

| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |
|------------|----------|---------------|---------------|---------|-----------|--------|
| Veil MCP index | Repository status bootstrap | 0.0135 | 0.0135 | 1.00 | 1.00 | ok |
| Veil MCP index | Incremental index refresh | 154.3728 | 154.3728 | 1.00 | 1.00 | ok |
| Veil MCP index | File lookup by path intent | 0.1600 | 0.1600 | 1.00 | 0.00 | ok |
| Veil MCP index | Symbol lookup by name intent | 0.0975 | 0.0975 | 1.00 | 0.33 | ok |
| Veil MCP index | Code content lookup | 0.3675 | 0.3675 | 1.00 | 1.00 | ok |
| Veil MCP index | Intent-aware lookup | 0.2913 | 0.2913 | 1.00 | 1.00 | ok |
| Veil MCP index | Combined discovery workflow | 0.2293 | 0.2293 | 1.00 | 1.00 | ok |
| Veil MCP index | Web search query | 1260.4569 | 1260.4569 | 1.00 | 1.00 | ok |
| Veil MCP index | URL fetch markdown-first | 21.2819 | 21.2819 | 1.00 | 1.00 | ok |
| Veil MCP index | Diagnostics lookup | 0.0557 | 0.0557 | 1.00 | 1.00 | ok |
| Veil MCP index | Git status lookup | 45.9138 | 45.9138 | 1.00 | 0.67 | ok |
| Veil MCP index | Git log lookup | 18.1547 | 18.1547 | 1.00 | 0.67 | ok |
| Veil MCP index | Git diff lookup | 23.0084 | 23.0084 | 1.00 | 1.00 | ok |
| Veil MCP index | Git show lookup | 18.1949 | 18.1949 | 1.00 | 0.67 | ok |
| Veil MCP index | GitHub repo context bootstrap | 7550.1591 | 7550.1591 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Repository status bootstrap | 32.5410 | 32.5410 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no index refresh equivalent in shell baseline |
| Shell tool workflow (Claude/Codex baseline) | File lookup by path intent | 19.4044 | 19.4044 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Symbol lookup by name intent | 8.6552 | 8.6552 | 1.00 | 0.33 | ok |
| Shell tool workflow (Claude/Codex baseline) | Code content lookup | 6.3130 | 6.3130 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Intent-aware lookup | 7.5007 | 7.5007 | 1.00 | 0.67 | ok |
| Shell tool workflow (Claude/Codex baseline) | Combined discovery workflow | 122.6433 | 122.6433 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Web search query | 688.2389 | 688.2389 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | URL fetch markdown-first | 157.4978 | 157.4978 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no equivalent tool in shell baseline |
| Shell tool workflow (Claude/Codex baseline) | Git status lookup | 10.7485 | 10.7485 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Git log lookup | 8.2813 | 8.2813 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Git diff lookup | 11.9452 | 11.9452 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Git show lookup | 7.4127 | 7.4127 | 1.00 | 0.67 | ok |
| Shell tool workflow (Claude/Codex baseline) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: spawnSync rg ENOBUFS (stdout or stderr buffer reached maxBuffer size limit) |
| Codex CLI baseline | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Web search query | 11078.3835 | 11078.3835 | 1.00 | 1.00 | ok |
| Codex CLI baseline | URL fetch markdown-first | 18366.3972 | 18366.3972 | 1.00 | 1.00 | ok |
| Codex CLI baseline | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI baseline | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Serena | Repository status bootstrap | 171.7684 | 171.7684 | 1.00 | 0.00 | ok |
| Serena | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no direct refresh equivalent in Serena adapter |
| Serena | File lookup by path intent | 107.7702 | 107.7702 | 1.00 | 0.00 | ok |
| Serena | Symbol lookup by name intent | 107.2132 | 107.2132 | 1.00 | 0.33 | ok |
| Serena | Code content lookup | 122.1685 | 122.1685 | 1.00 | 1.00 | ok |
| Serena | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'lookup' |
| Serena | Combined discovery workflow | 369.2635 | 369.2635 | 1.00 | 1.00 | ok |
| Serena | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'web_search' |
| Serena | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'fetch_url' |
| Serena | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'diagnostics' |
| Serena | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_status' |
| Serena | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_log' |
| Serena | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_diff' |
| Serena | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_show' |
| Serena | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'gh_lookup' |
