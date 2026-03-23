# Benchmark Suite Result

Generated: 2026-03-23T16:20:40.538Z
Workspace: /Users/shu/Code/veil
Profile: smoke
Agents: veil
Strategies: mcp_transport
Runtime budget: 120000ms
Cell budget: 20000ms
Iterations: cold=1, warm=5

## Environment

- Platform: darwin (arm64)
- Node: v24.3.0
- Bun: 1.3.3
- CPU: Apple M2 Pro (10 cores)

## Results

| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |
|------------|----------|---------------|---------------|---------|-----------|--------|
| veil (mcp_transport) | Repository status bootstrap | 351.5163 | 412.5676 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | File lookup by path intent | 454.1285 | 656.0840 | 1.00 | 0.67 | ok |
| veil (mcp_transport) | Symbol lookup by name intent | 548.6772 | 738.5630 | 1.00 | 0.33 | ok |
| veil (mcp_transport) | Code content lookup | 461.6388 | 485.3905 | 1.00 | 0.00 | ok |
| veil (mcp_transport) | Intent-aware lookup | 480.2447 | 559.1512 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Combined discovery workflow | 479.9609 | 482.2489 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Git status lookup | 370.5032 | 406.1030 | 1.00 | 0.67 | ok |

## Preflight

| Competitor | Ready | Mode Control | Reason |
|------------|-------|--------------|--------|
| veil (mcp_transport) | yes | strict | local veil MCP stdio transport |

## A/B Signals

| Competitor | Scenario | Schema Overhead (tokens) | First Useful Action (ms) | Fallback Rate |
|------------|----------|---------------------------|--------------------------|---------------|
| veil (mcp_transport) | Repository status bootstrap | 12000 | 412.5676 | 0.00 |
| veil (mcp_transport) | File lookup by path intent | 12000 | 656.0840 | 0.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 12000 | 481.1573 | 0.00 |
| veil (mcp_transport) | Code content lookup | 12000 | 0.0000 | 0.00 |
| veil (mcp_transport) | Intent-aware lookup | 12000 | 480.2447 | 0.00 |
| veil (mcp_transport) | Combined discovery workflow | 12000 | 482.2489 | 0.00 |
| veil (mcp_transport) | Git status lookup | 12000 | 406.1030 | 0.00 |

## Native Adoption Signals

| Competitor | Scenario | First Call Success | Calls To Useful Context | Non-Veil Fallback Rate |
|------------|----------|--------------------|-------------------------|------------------------|
| veil (mcp_transport) | Repository status bootstrap | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | File lookup by path intent | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Code content lookup | 1.00 | 2.00 | 0.00 |
| veil (mcp_transport) | Intent-aware lookup | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Combined discovery workflow | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Git status lookup | 1.00 | 1.00 | 0.00 |
