# Benchmark Suite Result

Generated: 2026-03-16T20:13:10.629Z
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
| veil (mcp_transport) | Repository status bootstrap | 365.7860 | 365.7860 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | File lookup by path intent | 345.1810 | 345.1810 | 1.00 | 0.67 | ok |
| veil (mcp_transport) | Symbol lookup by name intent | 341.7818 | 341.7818 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Code content lookup | 360.3892 | 360.3892 | 1.00 | 0.50 | ok |
| veil (mcp_transport) | Intent-aware lookup | 370.5873 | 370.5873 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Combined discovery workflow | 436.5554 | 436.5554 | 1.00 | 1.00 | ok |
| veil (mcp_transport) | Git status lookup | 399.7720 | 399.7720 | 1.00 | 0.67 | ok |
| veil (cli_skill) | Repository status bootstrap | 266.8455 | 266.8455 | 1.00 | 1.00 | ok |
| veil (cli_skill) | File lookup by path intent | 277.1895 | 277.1895 | 1.00 | 0.67 | ok |
| veil (cli_skill) | Symbol lookup by name intent | 290.8063 | 290.8063 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Code content lookup | 278.6475 | 278.6475 | 1.00 | 0.50 | ok |
| veil (cli_skill) | Intent-aware lookup | 270.4212 | 270.4212 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Combined discovery workflow | 325.9891 | 325.9891 | 1.00 | 1.00 | ok |
| veil (cli_skill) | Git status lookup | 578.6643 | 578.6643 | 1.00 | 0.67 | ok |
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
| veil (mcp_transport) | Repository status bootstrap | 12000 | 365.7860 | 1.00 |
| veil (mcp_transport) | File lookup by path intent | 12000 | 345.1810 | 1.00 |
| veil (mcp_transport) | Symbol lookup by name intent | 12000 | 341.7818 | 1.00 |
| veil (mcp_transport) | Code content lookup | 12000 | 360.3892 | 1.00 |
| veil (mcp_transport) | Intent-aware lookup | 12000 | 370.5873 | 1.00 |
| veil (mcp_transport) | Combined discovery workflow | 12000 | 436.5554 | 1.00 |
| veil (mcp_transport) | Git status lookup | 12000 | 399.7720 | 1.00 |
| veil (cli_skill) | Repository status bootstrap | 400 | 266.8455 | 0.00 |
| veil (cli_skill) | File lookup by path intent | 400 | 277.1895 | 0.00 |
| veil (cli_skill) | Symbol lookup by name intent | 400 | 290.8063 | 0.00 |
| veil (cli_skill) | Code content lookup | 400 | 278.6475 | 0.00 |
| veil (cli_skill) | Intent-aware lookup | 400 | 270.4212 | 0.00 |
| veil (cli_skill) | Combined discovery workflow | 400 | 325.9891 | 0.00 |
| veil (cli_skill) | Git status lookup | 400 | 578.6643 | 0.00 |
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
