# Benchmark Suite Result

Generated: 2026-03-16T10:34:35.478Z
Workspace: /Users/shu/Code/veil
Profile: smoke
Agents: veil,firecrawl
Strategies: mcp_transport,cli_skill
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
| veil (mcp_transport) | Repository status bootstrap | 334.6200 | 334.6200 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | File lookup by path intent | 328.6357 | 328.6357 | 1.00 | 0.67 | ok |
| veil (mcp_transport) | Symbol lookup by name intent | 331.4048 | 331.4048 | 1.00 | 0.33 | ok |
| veil (mcp_transport) | Code content lookup | 342.9068 | 342.9068 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Intent-aware lookup | 342.9462 | 342.9462 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Combined discovery workflow | 347.8771 | 347.8771 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Git status lookup | 342.8333 | 342.8333 | 1.00 | 0.67 | ok |
| veil (cli_skill) | Repository status bootstrap | 259.0540 | 259.0540 | 1.00 | 1.00 | ok |
| veil (cli_skill) | File lookup by path intent | 259.3834 | 259.3834 | 1.00 | 0.67 | ok |
| veil (cli_skill) | Symbol lookup by name intent | 265.1192 | 265.1192 | 1.00 | 0.33 | ok |
| veil (cli_skill) | Code content lookup | 271.4266 | 271.4266 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Intent-aware lookup | 256.4105 | 256.4105 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Combined discovery workflow | 283.7451 | 283.7451 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Git status lookup | 282.4903 | 282.4903 | 1.00 | 0.67 | ok |
| firecrawl (mcp_transport) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (mcp_transport) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (mcp_transport) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (mcp_transport) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (mcp_transport) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (mcp_transport) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (mcp_transport) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (cli_skill) | Repository status bootstrap | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |
| firecrawl (cli_skill) | File lookup by path intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |
| firecrawl (cli_skill) | Symbol lookup by name intent | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |
| firecrawl (cli_skill) | Code content lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |
| firecrawl (cli_skill) | Intent-aware lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |
| firecrawl (cli_skill) | Combined discovery workflow | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |
| firecrawl (cli_skill) | Git status lookup | 0.0000 | 0.0000 | 0.00 | 0.00 | unsupported: firecrawl unavailable: Executable not found in $PATH: "firecrawl" |

## Preflight

| Competitor | Ready | Mode Control | Reason |
|------------|-------|--------------|--------|
| veil (mcp_transport) | yes | strict | local veil MCP stdio transport |
| veil (cli_skill) | yes | strict | local veil CLI execution |
| firecrawl (mcp_transport) | no | strict | missing FIRECRAWL_API_KEY for firecrawl MCP |
| firecrawl (cli_skill) | no | strict | firecrawl unavailable: Executable not found in $PATH: "firecrawl" |

## A/B Signals

| Competitor | Scenario | Schema Overhead (tokens) | First Useful Action (ms) | Fallback Rate |
|------------|----------|---------------------------|--------------------------|---------------|
| veil (mcp_transport) | Repository status bootstrap | 12000 | 334.6200 | 1.00 |
| veil (mcp_transport) | File lookup by path intent | 12000 | 328.6357 | 1.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 12000 | 331.4048 | 1.00 |
| veil (mcp_transport) | Code content lookup | 12000 | 342.9068 | 1.00 |
| veil (mcp_transport) | Intent-aware lookup | 12000 | 342.9462 | 1.00 |
| veil (mcp_transport) | Combined discovery workflow | 12000 | 347.8771 | 1.00 |
| veil (mcp_transport) | Git status lookup | 12000 | 342.8333 | 1.00 |
| veil (cli_skill) | Repository status bootstrap | 400 | 259.0540 | 0.00 |
| veil (cli_skill) | File lookup by path intent | 400 | 259.3834 | 0.00 |
| veil (cli_skill) | Symbol lookup by name intent | 400 | 265.1192 | 0.00 |
| veil (cli_skill) | Code content lookup | 400 | 271.4266 | 0.00 |
| veil (cli_skill) | Intent-aware lookup | 400 | 256.4105 | 0.00 |
| veil (cli_skill) | Combined discovery workflow | 400 | 283.7451 | 0.00 |
| veil (cli_skill) | Git status lookup | 400 | 282.4903 | 0.00 |
| firecrawl (mcp_transport) | Repository status bootstrap | 12000 | 0.0000 | 1.00 |
| firecrawl (mcp_transport) | File lookup by path intent | 12000 | 0.0000 | 1.00 |
| firecrawl (mcp_transport) | Symbol lookup by name intent | 12000 | 0.0000 | 1.00 |
| firecrawl (mcp_transport) | Code content lookup | 12000 | 0.0000 | 1.00 |
| firecrawl (mcp_transport) | Intent-aware lookup | 12000 | 0.0000 | 1.00 |
| firecrawl (mcp_transport) | Combined discovery workflow | 12000 | 0.0000 | 1.00 |
| firecrawl (mcp_transport) | Git status lookup | 12000 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | Repository status bootstrap | 400 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | File lookup by path intent | 400 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | Symbol lookup by name intent | 400 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | Code content lookup | 400 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | Intent-aware lookup | 400 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | Combined discovery workflow | 400 | 0.0000 | 1.00 |
| firecrawl (cli_skill) | Git status lookup | 400 | 0.0000 | 1.00 |

## Native Adoption Signals

| Competitor | Scenario | First Call Success | Calls To Useful Context | Non-Veil Fallback Rate |
|------------|----------|--------------------|-------------------------|------------------------|
| veil (mcp_transport) | Repository status bootstrap | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | File lookup by path intent | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Code content lookup | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Intent-aware lookup | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Combined discovery workflow | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Git status lookup | 1.00 | 1.00 | 1.00 |
| veil (cli_skill) | Repository status bootstrap | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | File lookup by path intent | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | Symbol lookup by name intent | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | Code content lookup | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | Intent-aware lookup | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | Combined discovery workflow | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | Git status lookup | 1.00 | 1.00 | 0.00 |
| firecrawl (mcp_transport) | Repository status bootstrap | 0.00 | 3.00 | 1.00 |
| firecrawl (mcp_transport) | File lookup by path intent | 0.00 | 3.00 | 1.00 |
| firecrawl (mcp_transport) | Symbol lookup by name intent | 0.00 | 3.00 | 1.00 |
| firecrawl (mcp_transport) | Code content lookup | 0.00 | 3.00 | 1.00 |
| firecrawl (mcp_transport) | Intent-aware lookup | 0.00 | 3.00 | 1.00 |
| firecrawl (mcp_transport) | Combined discovery workflow | 0.00 | 3.00 | 1.00 |
| firecrawl (mcp_transport) | Git status lookup | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | Repository status bootstrap | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | File lookup by path intent | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | Symbol lookup by name intent | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | Code content lookup | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | Intent-aware lookup | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | Combined discovery workflow | 0.00 | 3.00 | 1.00 |
| firecrawl (cli_skill) | Git status lookup | 0.00 | 3.00 | 1.00 |
