# Benchmark Suite Result

Generated: 2026-03-07T11:50:25.247Z
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
| codex (veil) | Repository status bootstrap | 12077.2628 | 12077.2628 | 1.00 | 1.00 | ok |
| codex (veil) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Web search query | 21780.6215 | 21780.6215 | 1.00 | 1.00 | ok |
| codex (veil) | URL fetch markdown-first | 14740.1977 | 14740.1977 | 1.00 | 1.00 | ok |
| codex (veil) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Git status lookup | 11156.6833 | 11156.6833 | 1.00 | 0.33 | ok |
| codex (veil) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (veil) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (serena) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (serena) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (none) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (veil) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (serena) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| claude (none) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (veil) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (serena) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Incremental index refresh | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Web search query | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | URL fetch markdown-first | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Diagnostics lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Git log lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Git diff lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | Git show lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| opencode (none) | GitHub repo context bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
