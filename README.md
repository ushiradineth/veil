# veil

> High-performance MCP server and CLI for repository indexing and code search

Veil is a blazingly fast code indexing and search engine designed for AI agents and developer tools. It indexes code repositories and exposes retrieval tools over the Model Context Protocol (MCP), enabling sub-millisecond queries with minimal memory overhead.

## Features

- **Ultra-fast queries** - Sub-millisecond warm query latency (0.03-0.07ms p95)
- **Smart indexing** - Extracts files, symbols, and semantic code chunks
- **Flexible search** - File paths, symbol names, and full-text code search
- **Memory efficient** - <100MB for typical workloads with intelligent caching
- **Incremental updates** - Fast refresh with git-aware change detection
- **Battle-tested** - 100% test coverage with comprehensive benchmarks
- **Observable** - Built-in diagnostics and performance profiling
- **MCP native** - First-class Model Context Protocol support

## Performance

**Veil vs Traditional Tools:**
- **8,548x faster** on average than find/grep/ripgrep
- **Status check**: 1,039x faster (0.16ms vs 163ms)
- **Symbol search**: 28,418x faster (0.05ms vs 1,465ms)
- **Code search**: 1,113x faster (0.07ms vs 77ms)
- **Discovery**: 12,160x faster (0.12ms vs 1,453ms)

See [BENCHMARKS.md](BENCHMARKS.md) for detailed comparison with traditional tools.

**Memory usage:** <100MB for typical workloads  
**Test coverage:** 100% (29 tests)

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

```bash
# Build index
bun run src/cli.ts build --workspace <path>

# Check status
bun run src/cli.ts status --workspace <path>

# Refresh index (incremental)
bun run src/cli.ts refresh --workspace <path> --mode changed

# Search and discover
bun run src/cli.ts discover --workspace <path> --query "homebrew pnpm"

# Run diagnostics
bun run src/cli.ts diagnostics

# Run tests
bun run src/test.ts

# Benchmark (internal performance)
bun run src/bench-harness.ts --workspace <path> --warm 50

# Benchmark (vs traditional tools)
bun run src/bench-comparison.ts --workspace <path>
```

## MCP Tools

The server exposes the following MCP tools:

- **status** - Get index status and staleness reasons
- **refresh** - Build or refresh the index
- **files** - Find files by substring path query
- **symbols** - Find symbols by name
- **search** - Search indexed code chunks by keyword
- **discover** - Combined status + files + symbols + search in one call
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
bun run src/test.ts
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
