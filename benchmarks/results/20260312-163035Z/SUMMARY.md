# Benchmark Suite Result

Generated: 2026-03-12T16:30:40.144Z
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
| veil (mcp_transport) | Repository status bootstrap | 278.2771 | 278.2771 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | File lookup by path intent | 293.9072 | 293.9072 | 1.00 | 0.00 | ok |
| veil (mcp_transport) | Symbol lookup by name intent | 305.8332 | 305.8332 | 1.00 | 0.33 | ok |
| veil (mcp_transport) | Code content lookup | 302.8813 | 302.8813 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Intent-aware lookup | 307.8387 | 307.8387 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Combined discovery workflow | 299.2090 | 299.2090 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Git status lookup | 313.7513 | 313.7513 | 1.00 | 0.67 | ok |
| veil (cli_skill) | Repository status bootstrap | 211.1512 | 211.1512 | 1.00 | 1.00 | ok |
| veil (cli_skill) | File lookup by path intent | 247.5804 | 247.5804 | 1.00 | 0.00 | ok |
| veil (cli_skill) | Symbol lookup by name intent | 246.5070 | 246.5070 | 1.00 | 0.33 | ok |
| veil (cli_skill) | Code content lookup | 235.5865 | 235.5865 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Intent-aware lookup | 237.4309 | 237.4309 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Combined discovery workflow | 249.4950 | 249.4950 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Git status lookup | 251.3912 | 251.3912 | 1.00 | 0.67 | ok |
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
| veil (mcp_transport) | Repository status bootstrap | 12000 | 278.2771 | 1.00 |
| veil (mcp_transport) | File lookup by path intent | 12000 | 0.0000 | 1.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 12000 | 305.8332 | 1.00 |
| veil (mcp_transport) | Code content lookup | 12000 | 302.8813 | 1.00 |
| veil (mcp_transport) | Intent-aware lookup | 12000 | 307.8387 | 1.00 |
| veil (mcp_transport) | Combined discovery workflow | 12000 | 299.2090 | 1.00 |
| veil (mcp_transport) | Git status lookup | 12000 | 313.7513 | 1.00 |
| veil (cli_skill) | Repository status bootstrap | 400 | 211.1512 | 0.00 |
| veil (cli_skill) | File lookup by path intent | 400 | 0.0000 | 0.00 |
| veil (cli_skill) | Symbol lookup by name intent | 400 | 246.5070 | 0.00 |
| veil (cli_skill) | Code content lookup | 400 | 235.5865 | 0.00 |
| veil (cli_skill) | Intent-aware lookup | 400 | 237.4309 | 0.00 |
| veil (cli_skill) | Combined discovery workflow | 400 | 249.4950 | 0.00 |
| veil (cli_skill) | Git status lookup | 400 | 251.3912 | 0.00 |
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
| veil (mcp_transport) | File lookup by path intent | 1.00 | 2.00 | 1.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Code content lookup | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Intent-aware lookup | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Combined discovery workflow | 1.00 | 1.00 | 1.00 |
| veil (mcp_transport) | Git status lookup | 1.00 | 1.00 | 1.00 |
| veil (cli_skill) | Repository status bootstrap | 1.00 | 1.00 | 0.00 |
| veil (cli_skill) | File lookup by path intent | 1.00 | 2.00 | 0.00 |
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
