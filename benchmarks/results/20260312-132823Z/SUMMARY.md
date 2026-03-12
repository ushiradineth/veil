# Benchmark Suite Result

Generated: 2026-03-12T13:28:43.596Z
Workspace: /Users/shu/Code/veil
Profile: smoke
Agents: codex
Strategies: mcp_baseline,cli_skill
Runtime budget: 20000ms
Cell budget: 5000ms
Iterations: cold=1, warm=1

## Environment

- Platform: darwin (arm64)
- Node: v24.3.0
- Bun: 1.3.3
- CPU: Apple M2 Pro (10 cores)

## Results

| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |
|------------|----------|---------------|---------------|---------|-----------|--------|
| codex (mcp_baseline) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (mcp_baseline) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (mcp_baseline) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (mcp_baseline) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (mcp_baseline) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (mcp_baseline) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (mcp_baseline) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (cli_skill) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (cli_skill) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: codex timeout |
| codex (cli_skill) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (cli_skill) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (cli_skill) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (cli_skill) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |
| codex (cli_skill) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: suite runtime budget exceeded |

## Preflight

| Competitor | Ready | Mode Control | Reason |
|------------|-------|--------------|--------|
| codex (mcp_baseline) | yes | prompt_only | strategy wiring controlled via benchmark prompts |
| codex (cli_skill) | yes | prompt_only | strategy wiring controlled via benchmark prompts |

## A/B Signals

| Competitor | Scenario | Schema Overhead (tokens) | First Useful Action (ms) | Fallback Rate |
|------------|----------|---------------------------|--------------------------|---------------|
| codex (mcp_baseline) | Repository status bootstrap | 12000 | 0.0000 | 1.00 |
| codex (mcp_baseline) | File lookup by path intent | 12000 | 0.0000 | 1.00 |
| codex (mcp_baseline) | Symbol lookup by name intent | 12000 | 0.0000 | 1.00 |
| codex (mcp_baseline) | Code content lookup | 12000 | 0.0000 | 1.00 |
| codex (mcp_baseline) | Intent-aware lookup | 12000 | 0.0000 | 1.00 |
| codex (mcp_baseline) | Combined discovery workflow | 12000 | 0.0000 | 1.00 |
| codex (mcp_baseline) | Git status lookup | 12000 | 0.0000 | 1.00 |
| codex (cli_skill) | Repository status bootstrap | 400 | 0.0000 | 1.00 |
| codex (cli_skill) | File lookup by path intent | 400 | 0.0000 | 1.00 |
| codex (cli_skill) | Symbol lookup by name intent | 400 | 0.0000 | 1.00 |
| codex (cli_skill) | Code content lookup | 400 | 0.0000 | 1.00 |
| codex (cli_skill) | Intent-aware lookup | 400 | 0.0000 | 1.00 |
| codex (cli_skill) | Combined discovery workflow | 400 | 0.0000 | 1.00 |
| codex (cli_skill) | Git status lookup | 400 | 0.0000 | 1.00 |

## Native Adoption Signals

| Competitor | Scenario | First Call Success | Calls To Useful Context | Non-Veil Fallback Rate |
|------------|----------|--------------------|-------------------------|------------------------|
| codex (mcp_baseline) | Repository status bootstrap | 0.00 | 3.00 | 1.00 |
| codex (mcp_baseline) | File lookup by path intent | 0.00 | 3.00 | 1.00 |
| codex (mcp_baseline) | Symbol lookup by name intent | 0.00 | 3.00 | 1.00 |
| codex (mcp_baseline) | Code content lookup | 0.00 | 3.00 | 1.00 |
| codex (mcp_baseline) | Intent-aware lookup | 0.00 | 3.00 | 1.00 |
| codex (mcp_baseline) | Combined discovery workflow | 0.00 | 3.00 | 1.00 |
| codex (mcp_baseline) | Git status lookup | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | Repository status bootstrap | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | File lookup by path intent | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | Symbol lookup by name intent | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | Code content lookup | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | Intent-aware lookup | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | Combined discovery workflow | 0.00 | 3.00 | 1.00 |
| codex (cli_skill) | Git status lookup | 0.00 | 3.00 | 1.00 |
