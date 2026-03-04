# Benchmark Suite Result

Generated: 2026-03-04T09:07:51.654Z
Workspace: /Users/shu/Code/veil
Iterations: cold=1, warm=50

## Environment

- Platform: darwin (arm64)
- Node: v24.3.0
- Bun: 1.3.3
- CPU: Apple M2 Pro (10 cores)

## Results

| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |
|------------|----------|---------------|---------------|---------|-----------|--------|
| Veil MCP index | Repository status bootstrap | 0.0030 | 0.0093 | 1.00 | 1.00 | ok |
| Veil MCP index | File lookup by path intent | 0.0551 | 0.3357 | 1.00 | 0.00 | ok |
| Veil MCP index | Symbol lookup by name intent | 0.0643 | 0.2211 | 1.00 | 0.33 | ok |
| Veil MCP index | Code content lookup | 0.0948 | 0.1578 | 1.00 | 1.00 | ok |
| Veil MCP index | Combined discovery workflow | 0.1030 | 0.1621 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Repository status bootstrap | 28.7980 | 46.5411 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | File lookup by path intent | 18.7887 | 20.4160 | 1.00 | 0.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Symbol lookup by name intent | 8.1025 | 9.2040 | 1.00 | 0.33 | ok |
| Shell tool workflow (Claude/Codex baseline) | Code content lookup | 6.8291 | 8.0280 | 1.00 | 1.00 | ok |
| Shell tool workflow (Claude/Codex baseline) | Combined discovery workflow | 44.4124 | 51.2049 | 1.00 | 1.00 | ok |
| Serena | Repository status bootstrap | 161.4635 | 179.6677 | 1.00 | 0.00 | ok |
| Serena | File lookup by path intent | 108.1072 | 109.8469 | 1.00 | 0.00 | ok |
| Serena | Symbol lookup by name intent | 109.0558 | 112.8560 | 1.00 | 0.33 | ok |
| Serena | Code content lookup | 121.5505 | 123.9229 | 1.00 | 1.00 | ok |
| Serena | Combined discovery workflow | 342.7359 | 358.4811 | 1.00 | 1.00 | ok |
