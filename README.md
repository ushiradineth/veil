# scry

Local MCP server and CLI for repository indexing.

It writes index artifacts to `<workspace>/.agents/index/*` and exposes retrieval tools over MCP stdio.

Quick commands:

- `bun run src/cli.ts status --workspace <path>`
- `bun run src/cli.ts refresh --workspace <path> --mode changed`
- `bun run src/cli.ts discover --workspace <path> --query "homebrew pnpm"`
- `bun run src/bench.ts --workspace <path> --iterations 40`
- `bun run src/bench-harness.ts --workspace <path> --warm 50`
