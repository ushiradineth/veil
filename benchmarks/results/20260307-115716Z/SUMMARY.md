# Benchmark Suite Result

Generated: 2026-03-07T12:17:49.915Z
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
| codex (veil) | Repository status bootstrap | 11606.0064 | 11606.0064 | 1.00 | 1.00 | ok |
| codex (veil) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (veil) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | Repository status bootstrap | 12075.7425 | 12075.7425 | 1.00 | 1.00 | ok |
| codex (serena) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (serena) | File lookup by path intent | 12051.7290 | 12051.7290 | 1.00 | 0.67 | ok |
| codex (serena) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (serena) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (serena) | Intent-aware lookup | 13199.8489 | 13199.8489 | 1.00 | 0.67 | ok |
| codex (serena) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (serena) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (serena) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | Repository status bootstrap | 13784.6598 | 13784.6598 | 1.00 | 1.00 | ok |
| codex (none) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (none) | File lookup by path intent | 13675.3533 | 13675.3533 | 1.00 | 0.67 | ok |
| codex (none) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (none) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (none) | Intent-aware lookup | 7975.8804 | 7975.8804 | 1.00 | 0.67 | ok |
| codex (none) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (none) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| codex (none) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (veil) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (serena) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| claude (none) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | error: exit status 1 |
| opencode (veil) | Repository status bootstrap | 8719.6784 | 8719.6784 | 1.00 | 0.67 | ok |
| opencode (veil) | Incremental index refresh | 13620.7446 | 13620.7446 | 1.00 | 0.33 | ok |
| opencode (veil) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (veil) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Repository status bootstrap | 10484.4130 | 10484.4130 | 1.00 | 0.33 | ok |
| opencode (serena) | Incremental index refresh | 9639.4690 | 9639.4690 | 1.00 | 0.33 | ok |
| opencode (serena) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (serena) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Repository status bootstrap | 9969.6182 | 9969.6182 | 1.00 | 0.00 | ok |
| opencode (none) | Incremental index refresh | 8010.8839 | 8010.8839 | 1.00 | 0.00 | ok |
| opencode (none) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: opencode timeout |
| opencode (none) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
