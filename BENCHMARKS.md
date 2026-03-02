# Performance Benchmarks

Veil vs traditional command-line tools (find, grep, ripgrep, git) used by AI coding assistants like Claude and Codex.

## Test Environment

- **Repository**: nix-config (218 files, 3,909 symbols, 273 code chunks)
- **Hardware**: Apple Silicon (M-series)
- **Runtime**: Bun 1.x
- **Date**: March 2026

## Results Summary

**Veil wins: 5/5 benchmarks**  
**Average speedup: 8,548x faster than traditional tools**

## Detailed Results

| Benchmark | Veil (ms) | Traditional (ms) | Speedup | Winner |
|-----------|-----------|------------------|---------|--------|
| **Status Check** (get repository info) | 0.16 | 163.38 | **1,039x** | veil |
| **File Search** (find files matching 'homebrew') | 1.93 | 19.32 | **10x** | veil |
| **Symbol Search** (find 'build' functions/classes) | 0.05 | 1,464.73 | **28,418x** | veil |
| **Code Search** (find 'pnpm install' in code) | 0.07 | 77.47 | **1,113x** | veil |
| **Discovery** (files + symbols + code combined) | 0.12 | 1,452.57 | **12,160x** | veil |

## What This Means for AI Agents

### Traditional Approach (Claude/Codex without veil)

When an AI agent needs to understand your codebase, it typically:

1. **File search**: Runs `find . -name "*pattern*"` (19ms)
2. **Symbol search**: Runs `grep -r "function.*name"` (1,465ms)
3. **Code search**: Runs `rg "search term"` (77ms)
4. **Status check**: Runs `git status && find . -type f` (163ms)

**Total time for discovery**: ~1,724ms (1.7 seconds)

### With Veil

The same operations complete in **0.12ms** - a **12,160x speedup**.

This means:
- **Instant context retrieval** instead of multi-second waits
- **Lower latency** for every code-related query
- **Better user experience** with near-instantaneous responses
- **Reduced API costs** from faster tool execution

## Why Veil is Faster

### Pre-built Indexes

Veil builds indexes once and reuses them:
- **Files index**: All file paths with metadata
- **Symbols index**: Extracted functions, classes, types
- **Chunks index**: Semantic code blocks with full-text search

### Optimized Algorithms

- **Heap-based top-K**: O(n log k) instead of O(n²) sorting
- **Token indexes**: Pre-computed for instant lookup
- **Single-pass parsing**: Minimal allocations
- **Parallel processing**: Multi-core index building

### Smart Caching

- **In-memory cache**: Validated with mtime checks
- **Query result cache**: Repeated queries are instant
- **Status cache**: Reduces filesystem operations

## Traditional Tools Comparison

| Tool | Use Case | Typical Latency | Veil Equivalent | Veil Latency |
|------|----------|-----------------|-----------------|--------------|
| `find` | File search | 10-50ms | `queryFiles` | 0.05-2ms |
| `grep` | Symbol search | 500-2000ms | `querySymbols` | 0.03-0.1ms |
| `rg` (ripgrep) | Code search | 50-200ms | `queryChunks` | 0.03-0.1ms |
| `git status` | Repository info | 100-300ms | `getStatus` | 0.1-0.2ms |
| Multiple calls | Combined discovery | 1000-3000ms | `discover` | 0.1-0.3ms |

## Real-World Impact

### Example: AI Agent Code Review

**Without veil** (traditional tools):
```
1. Find relevant files: 20ms
2. Search for function definitions: 1,500ms
3. Find related code: 80ms
4. Get file contents: 50ms
Total: ~1,650ms per query
```

**With veil**:
```
1. Discover (files + symbols + code): 0.12ms
2. Get file contents: 50ms
Total: ~50ms per query
```

**Result**: 33x faster overall, with most time spent on file I/O (which is unavoidable).

### Example: Multi-Step Code Analysis

An AI agent analyzing a codebase might make 10-20 queries:

- **Without veil**: 10 queries × 1,650ms = 16.5 seconds
- **With veil**: 10 queries × 50ms = 0.5 seconds

**Result**: 33x faster for typical analysis workflows.

## Running the Benchmark

```bash
# Build index first
bun run src/cli.ts build --workspace /path/to/repo

# Run comparison benchmark
bun run src/bench-comparison.ts --workspace /path/to/repo
```

## Methodology

### Warm Cache Testing

All benchmarks use warm caches to measure steady-state performance:
- Veil: Index loaded in memory
- Traditional: OS filesystem cache warm

This represents typical usage where the same repository is queried multiple times.

### Traditional Tool Commands

- **File search**: `find . -type f -name "*pattern*"`
- **Symbol search**: `grep -r -E "(function|class|def).*pattern" .`
- **Code search**: `rg "pattern" --max-count 10`
- **Status**: `git status && find . -type f`
- **Discovery**: Sequential execution of all above

### Fairness

- Both approaches use the same repository
- Both have warm caches (OS cache for traditional, memory cache for veil)
- Traditional tools are industry-standard (find, grep, ripgrep)
- No artificial delays or throttling

## Limitations

### When Traditional Tools May Be Better

- **One-time queries**: If you only query once, index build time matters
- **Very small repos**: <10 files may not benefit from indexing
- **Regex complexity**: Some advanced regex patterns may be faster with ripgrep

### When Veil Excels

- **Repeated queries**: Multiple queries on the same codebase
- **Medium to large repos**: 100+ files
- **AI agent workflows**: Frequent context retrieval
- **Combined operations**: Files + symbols + code in one call

## Conclusion

Veil provides **8,548x average speedup** over traditional command-line tools for code search and discovery operations. This makes it ideal for AI coding assistants that need fast, repeated access to codebase context.

The performance advantage comes from:
1. Pre-built indexes (one-time cost, infinite reuse)
2. Optimized algorithms (heap-based ranking, token indexes)
3. Smart caching (in-memory, query-level, status-level)
4. Parallel processing (multi-core index building)

For AI agents making dozens of queries per session, veil transforms multi-second waits into sub-millisecond responses.
