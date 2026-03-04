# veil

> High-performance MCP server and CLI for repository indexing and code search

Veil is a blazingly fast code indexing and search engine designed for AI agents and developer tools. It indexes code repositories and exposes retrieval tools over the Model Context Protocol (MCP), enabling sub-millisecond queries with minimal memory overhead.

## Features

- **Ultra-fast queries** - Sub-millisecond warm query latency (0.03-0.07ms p95)
- **Smart indexing** - Extracts files, symbols, and semantic code chunks
- **Flexible search** - File paths, symbol names, and full-text code search
- **Memory efficient** - <100MB for typical workloads with intelligent caching
- **Incremental updates** - Fast refresh with git-aware change detection
- **Battle-tested** - Comprehensive correctness and performance test coverage
- **Observable** - Built-in diagnostics and performance profiling
- **MCP native** - First-class Model Context Protocol support

## Performance

Veil includes a reproducible benchmark suite for public comparisons across:

- Veil MCP index tools
- Shell tool workflows commonly used by non-indexed agent loops
- Serena via `uvx` (from `https://github.com/oraios/serena`) plus optional custom adapter configs

See [BENCHMARKS.md](BENCHMARKS.md) for methodology, fairness rules, and commands to generate fresh benchmark artifacts.

**Memory usage:** <100MB for typical workloads  
**Test coverage:** Run `bun test ./src/test.ts` for current suite status

## Installation

**Requirements:**
- Bun runtime (or Node.js 18+)
- Git (optional, for git-aware indexing)

**Clone and install:**

```bash
git clone https://github.com/ushiradineth/veil.git
cd veil
bun install
```

## MCP Setup

Add veil to your MCP client configuration:

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veil": {
      "command": "bun",
      "args": ["run", "/path/to/veil/src/server.ts"],
      "env": {}
    }
  }
}
```

### Codex

Edit `~/.config/codex/mcp.json`:

```json
{
  "mcpServers": {
    "veil": {
      "command": "bun",
      "args": ["run", "/path/to/veil/src/server.ts"]
    }
  }
}
```

### OpenCode

Edit `~/.config/opencode/mcp.json`:

```json
{
  "mcpServers": {
    "veil": {
      "command": "bun",
      "args": ["run", "/path/to/veil/src/server.ts"]
    }
  }
}
```

**Example with workspace:**

To index a specific repository (e.g., `~/nix-config`), first build the index:

```bash
bun run src/cli.ts build --workspace ~/nix-config
```

Then use the MCP tools with `workspace: "~/nix-config"` parameter, or omit it to use the current working directory.

## CLI Usage

All CLI and MCP text outputs are emitted in TOON format (not JSON text).

```bash
# Build index
bun run src/cli.ts build --workspace <path>

# Check status
bun run src/cli.ts status --workspace <path>

# Refresh index (incremental)
bun run src/cli.ts refresh --workspace <path> --mode changed

# Search and discover
bun run src/cli.ts discover --workspace <path> --query "homebrew pnpm"

# Intent-aware lookup with explainability
bun run src/cli.ts lookup --workspace <path> --query "where is buildIndex defined"

# Fast web search without API keys (google, duckduckgo, wikipedia, github, reddit, deepwiki)
bun run src/cli.ts web-search --query "typescript language server"

# Optional debug diagnostics for web search (provider trace, ranking details)
bun run src/cli.ts web-search --query "typescript language server" --debug 1

# Fetch URL content with markdown-first negotiation
bun run src/cli.ts fetch-url --url "https://example.com" --format markdown

# Git repository lookups
bun run src/cli.ts git-status --workspace <path>
bun run src/cli.ts git-log --workspace <path> --limit 20
bun run src/cli.ts git-diff --workspace <path> --staged 0 --path src/indexer.ts
bun run src/cli.ts git-show --workspace <path> --rev HEAD

# Optional GitHub lookup via gh CLI
bun run src/cli.ts gh-lookup --workspace <path> --repo owner/name --kind prs --limit 10

# Run diagnostics
bun run src/cli.ts diagnostics

# Run tests
bun test ./src/test.ts

# Benchmark (internal performance)
bun run src/bench-harness.ts --workspace <path> --warm 50

# Benchmark (vs traditional tools)
bun run src/bench-comparison.ts --workspace <path>

# Benchmark suite (public, multi-competitor)
bun run src/bench-suite.ts --workspace <path> --cold 1 --warm 50 --out benchmarks/results/latest

# Benchmark suite with custom Serena command overrides (optional)
bun run src/bench-suite.ts --workspace <path> --serena-config benchmarks/serena.config.example.json --out benchmarks/results/latest
```

## MCP Tools

The server exposes the following MCP tools:

- **status** - Get index status and staleness reasons
- **refresh** - Build or refresh the index
- **files** - Find files by substring path query
- **symbols** - Find symbols by name
- **search** - Search indexed code chunks by keyword
- **lookup** - Intent-aware contextual lookup with confidence and fallback metadata
- **web_search** - Fast web search without API keys (google, duckduckgo, wikipedia, github, reddit, deepwiki), minimal results by default with optional debug diagnostics
- **fetch_url** - Fetch URL content with markdown-first output negotiation and fallback conversion
  - returns `markdown_tokens`, `content_signal`, and `vary` when present in response headers
- **discover** - Combined status + files + symbols + search in one call
- **git_status** - Inspect branch state and dirty workspace changes
- **git_log** - Query commit history with limit and filters
- **git_diff** - Inspect uncommitted or revision-range diff output
- **git_show** - Show commit details and optional patch output
- **gh_lookup** - Optional GitHub issues/PRs/checks lookup via `gh`
- **diagnostics** - Get performance diagnostics and cache stats

## Index Storage

Index artifacts are written to `<workspace>/.agents/index/`:
- `files.ndjson` - File records with metadata
- `symbols.ndjson` - Extracted symbols (functions, classes, types)
- `chunks.ndjson` - Code chunks for semantic search
- `manifest.json` - Index metadata and staleness tracking

## Architecture

**Hot path optimizations:**
- Heap-based top-K scoring (O(n log k) vs O(n²))
- Single-pass NDJSON parsing
- Parallel file processing with batching
- Normalized string caching for memory efficiency

**Caching strategy:**
- In-memory index cache with mtime validation
- Query result caching per workspace
- Status cache with TTL

## Development

**Run tests:**
```bash
bun test ./src/test.ts
```

**Run benchmarks:**
```bash
bun run src/bench-harness.ts --workspace /path/to/repo --warm 100
```

**Start MCP server:**
```bash
bun run src/server.ts
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Acknowledgments

Built with performance in mind, leveraging:
- Heap-based top-K algorithms for efficient ranking
- Single-pass parsing to minimize allocations
- Parallel file processing for multi-core systems
- Intelligent caching strategies for memory efficiency
