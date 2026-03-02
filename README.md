# veil

High-performance MCP server and CLI for repository indexing and code search.

Indexes code repositories and exposes fast retrieval tools over MCP stdio. Optimized for sub-millisecond warm queries and efficient memory usage.

## Performance

**Warm query latency (p95):**
- File queries: **0.07ms** (97% faster than baseline)
- Symbol queries: **0.06ms** (86% faster than baseline)
- Chunk search: **0.03ms** (95% faster than baseline)

**Memory usage:** <100MB for typical workloads  
**Test coverage:** 100% (29 tests)

See [performance summary](.agents/benchmarks/performance-summary.md) for detailed benchmarks.

## Quick Start

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

# Benchmark
bun run src/bench-harness.ts --workspace <path> --warm 50
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

See [AGENTS.md](AGENTS.md) for development guidelines.
