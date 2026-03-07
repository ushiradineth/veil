# Benchmark Suite Result

Generated: 2026-03-07T11:34:28.392Z
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
| Veil MCP index | Repository status bootstrap | 0.0165 | 0.0165 | 1.00 | 1.00 | ok |
| Veil MCP index | Incremental index refresh | 104.2313 | 104.2313 | 1.00 | 1.00 | ok |
| Veil MCP index | File lookup by path intent | 0.2005 | 0.2005 | 1.00 | 0.00 | ok |
| Veil MCP index | Symbol lookup by name intent | 0.1442 | 0.1442 | 1.00 | 0.33 | ok |
| Veil MCP index | Code content lookup | 0.3845 | 0.3845 | 1.00 | 1.00 | ok |
| Veil MCP index | Intent-aware lookup | 0.3184 | 0.3184 | 1.00 | 1.00 | ok |
| Veil MCP index | Combined discovery workflow | 0.4630 | 0.4630 | 1.00 | 1.00 | ok |
| Veil MCP index | Web search query | 1389.3510 | 1389.3510 | 1.00 | 1.00 | ok |
| Veil MCP index | URL fetch markdown-first | 51.8330 | 51.8330 | 1.00 | 1.00 | ok |
| Veil MCP index | Diagnostics lookup | 0.0490 | 0.0490 | 1.00 | 1.00 | ok |
| Veil MCP index | Git status lookup | 45.2292 | 45.2292 | 1.00 | 0.67 | ok |
| Veil MCP index | Git log lookup | 17.8691 | 17.8691 | 1.00 | 0.67 | ok |
| Veil MCP index | Git diff lookup | 22.3671 | 22.3671 | 1.00 | 1.00 | ok |
| Veil MCP index | Git show lookup | 19.7579 | 19.7579 | 1.00 | 0.67 | ok |
| Veil MCP index | GitHub repo context bootstrap | 6219.5662 | 6219.5662 | 1.00 | 1.00 | ok |
| Shell tool workflow | Repository status bootstrap | 33.3235 | 33.3235 | 1.00 | 1.00 | ok |
| Shell tool workflow | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no index refresh equivalent in shell baseline |
| Shell tool workflow | File lookup by path intent | 19.7344 | 19.7344 | 1.00 | 0.00 | ok |
| Shell tool workflow | Symbol lookup by name intent | 9.7300 | 9.7300 | 1.00 | 0.33 | ok |
| Shell tool workflow | Code content lookup | 6.9660 | 6.9660 | 1.00 | 1.00 | ok |
| Shell tool workflow | Intent-aware lookup | 6.5273 | 6.5273 | 1.00 | 0.67 | ok |
| Shell tool workflow | Combined discovery workflow | 100.1924 | 100.1924 | 1.00 | 1.00 | ok |
| Shell tool workflow | Web search query | 689.6913 | 689.6913 | 1.00 | 1.00 | ok |
| Shell tool workflow | URL fetch markdown-first | 51.3588 | 51.3588 | 1.00 | 1.00 | ok |
| Shell tool workflow | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no equivalent tool in shell baseline |
| Shell tool workflow | Git status lookup | 9.5123 | 9.5123 | 1.00 | 0.00 | ok |
| Shell tool workflow | Git log lookup | 7.6110 | 7.6110 | 1.00 | 0.00 | ok |
| Shell tool workflow | Git diff lookup | 12.9407 | 12.9407 | 1.00 | 1.00 | ok |
| Shell tool workflow | Git show lookup | 7.4283 | 7.4283 | 1.00 | 0.67 | ok |
| Shell tool workflow | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: spawnSync rg ENOBUFS (stdout or stderr buffer reached maxBuffer size limit) |
| Codex CLI | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Web search query | 7057.6395 | 7057.6395 | 1.00 | 1.00 | ok |
| Codex CLI | URL fetch markdown-first | 16101.6052 | 16101.6052 | 1.00 | 1.00 | ok |
| Codex CLI | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Codex CLI | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex baseline limited to web scenarios |
| Serena | Repository status bootstrap | 168.3040 | 168.3040 | 1.00 | 0.00 | ok |
| Serena | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no direct refresh equivalent in Serena adapter |
| Serena | File lookup by path intent | 111.2466 | 111.2466 | 1.00 | 0.00 | ok |
| Serena | Symbol lookup by name intent | 116.6754 | 116.6754 | 1.00 | 0.33 | ok |
| Serena | Code content lookup | 122.5474 | 122.5474 | 1.00 | 1.00 | ok |
| Serena | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'lookup' |
| Serena | Combined discovery workflow | 363.8934 | 363.8934 | 1.00 | 1.00 | ok |
| Serena | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'web_search' |
| Serena | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'fetch_url' |
| Serena | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'diagnostics' |
| Serena | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_status' |
| Serena | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_log' |
| Serena | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_diff' |
| Serena | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'git_show' |
| Serena | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: no Serena mapping for 'gh_lookup' |
