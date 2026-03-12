# Veil Agent Guide

## Commands

- Install deps: `nix run nixpkgs#bun -- install`
- Run tests: `nix run nixpkgs#bun -- test ./src/test.ts`
- Run coverage: `nix run nixpkgs#bun -- test --coverage ./src/test.ts`
- CLI status: `nix run nixpkgs#bun -- run src/cli.ts status`
- Benchmark suite: `nix run nixpkgs#bun -- run src/bench-suite.ts --workspace <path> --cold 1 --warm 10 --out benchmarks/results/latest`
- Build npm package bundle: `node scripts/build-package.mjs`
- Dry-run npm package tarball: `npm pack --dry-run`

## Testing

- Always run `nix run nixpkgs#bun -- test ./src/test.ts` after behavior changes.
- For performance or benchmark changes, run at least one fresh suite and update `benchmarks/results/latest/*`.
- Keep benchmark tables in `BENCHMARKS.md` aligned with `benchmarks/results/latest/results.json`.

## Project Structure

- `src/cli.ts`: primary CLI command surface.
- `src/bin.ts`: npm package entrypoint router (`cli` subcommand).
- `src/indexer.ts`: indexing and local code retrieval core.
- `src/indexer/build.ts`: incremental merge and record sorting helpers.
- `src/query.ts`: lookup scoring and ranking helpers.
- `src/cache.ts`: shared TopK heap and bounded LRU helpers.
- `src/web-search.ts`: no-key multi-provider web search.
- `src/fetch-url.ts`: markdown-first URL content retrieval.
- `src/git.ts`: git and optional GitHub (`gh`) lookups.
- `src/validation.ts`: shared validation and clamp helpers.
- `src/errors.ts`: shared error message and timeout helpers.
- `src/state-root.ts`: state directory resolution (default `.veil`).
- `src/diagnostics.ts`: performance diagnostics and cache counters.
- `src/types.ts`: shared response contracts.
- `src/test.ts`: full Bun test suite.
- `bin/veil.mjs`: npm bin wrapper (Node entrypoint).
- `scripts/build-package.mjs`: esbuild bundler for npm publish.
- `benchmarks/results/`: benchmark artifacts.

## Code Style

- TypeScript with explicit response contracts in `src/types.ts`.
- Keep outputs token-lean and deterministic.
- CLI text output must stay TOON-formatted.
- Avoid ad hoc shell parsing when a typed utility exists.

## Token Sensitivity

- This project is for agents. Optimize for low token usage.
- Be as descriptive as needed for correct execution, then stop.
- Prefer short, directive wording over narrative explanations.
- Avoid repeating context already present in prompts, tool schemas, or command output.
- Keep skill and onboarding artifacts compact and operational.
- Keep tool descriptions and guidance text compact by default to reduce token overhead.

## CLI Routing Policy

See `SKILL.md` for the canonical routing order and anti-patterns.

## No-Skill Defaults

- CLI command descriptions are intent-first and should be treated as the primary no-skill routing surface for generic agents.
- Default objective is native-first Veil selection across all replaceable workflows (local retrieval, git context, web/fetch, GitHub context).
- Veil exposes compatibility aliases for common retrieval heuristics: `find_file`, `find_symbol`, `search_for_pattern`.
- Query tools (`files`, `symbols`, `search`, `lookup`) auto-refresh stale indexes by default.
- No project-specific environment variables are required for normal operation.

## Skill Trigger (Operational)

When a prompt includes words like `research`, `investigate`, `find where`, `summarize from web`, or `compare docs`, apply:

1. `discover` for local context
2. `web_search` for external candidates
3. `fetch_url` for top URLs
4. Return concise synthesis with source URLs

Use `SKILL.md` as the canonical reusable skill prompt.

## Git Workflow

- Keep diffs tightly scoped to requested work.
- Run tests before commit.
- Use conventional commits with sign-off: `git commit -s -m "feat(scope): message"`.
- Never use force-push on protected branches.

## Boundaries

### Always

- Prefer Veil CLI tools over shell equivalents for supported intents.
- Keep benchmark and docs claims backed by fresh artifacts.
- Preserve TOON output formatting for agent-facing responses.

### Ask First

- Destructive operations.
- New runtime dependencies that affect production behavior.
- Benchmark methodology changes that affect published comparability.

### Never

- Commit secrets or credentials.
- Bypass git hooks with `--no-verify`.
- Publish benchmark claims not present in `results.json`.
