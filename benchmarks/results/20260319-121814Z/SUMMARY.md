# Benchmark Suite Result

Generated: 2026-03-19T12:18:18.751Z
Workspace: /Users/shu/Code/veil
Profile: smoke
Agents: veil
Strategies: mcp_transport
Runtime budget: 120000ms
Cell budget: 20000ms
Iterations: cold=1, warm=1

## Environment

- Platform: darwin (arm64)
- Node: v24.3.0
- Bun: 1.3.3
- CPU: Apple M2 Pro (10 cores)

## Results

| Competitor | Scenario | Warm p50 (ms) | Warm p95 (ms) | Success | Relevance | Status |
|------------|----------|---------------|---------------|---------|-----------|--------|
| veil (mcp_transport) | Repository status bootstrap | 395.9953 | 395.9953 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | File lookup by path intent | 640.8661 | 640.8661 | 1.00 | 0.67 | ok |
| veil (mcp_transport) | Symbol lookup by name intent | 599.2184 | 599.2184 | 1.00 | 0.67 | ok |
| veil (mcp_transport) | Code content lookup | 596.0915 | 596.0915 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Intent-aware lookup | 608.3995 | 608.3995 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Combined discovery workflow | 656.0138 | 656.0138 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Git status lookup | 354.2710 | 354.2710 | 1.00 | 0.67 | ok |

## Preflight

| Competitor | Ready | Mode Control | Reason |
|------------|-------|--------------|--------|
| veil (mcp_transport) | yes | strict | local veil MCP stdio transport |

## A/B Signals

| Competitor | Scenario | Schema Overhead (tokens) | First Useful Action (ms) | Fallback Rate |
|------------|----------|---------------------------|--------------------------|---------------|
| veil (mcp_transport) | Repository status bootstrap | 12000 | 395.9953 | 0.00 |
| veil (mcp_transport) | File lookup by path intent | 12000 | 640.8661 | 0.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 12000 | 599.2184 | 0.00 |
| veil (mcp_transport) | Code content lookup | 12000 | 596.0915 | 0.00 |
| veil (mcp_transport) | Intent-aware lookup | 12000 | 608.3995 | 0.00 |
| veil (mcp_transport) | Combined discovery workflow | 12000 | 656.0138 | 0.00 |
| veil (mcp_transport) | Git status lookup | 12000 | 354.2710 | 0.00 |

## Native Adoption Signals

| Competitor | Scenario | First Call Success | Calls To Useful Context | Non-Veil Fallback Rate |
|------------|----------|--------------------|-------------------------|------------------------|
| veil (mcp_transport) | Repository status bootstrap | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | File lookup by path intent | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Code content lookup | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Intent-aware lookup | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Combined discovery workflow | 1.00 | 1.00 | 0.00 |
| veil (mcp_transport) | Git status lookup | 1.00 | 1.00 | 0.00 |
