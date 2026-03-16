# Veil Agent Guide

## Commands

- Install deps: `nix run nixpkgs#bun -- install`
- Run tests: `nix run nixpkgs#bun -- test ./src/test.ts`
- Run coverage: `nix run nixpkgs#bun -- test --coverage ./src/test.ts`
- CLI status: `nix run nixpkgs#bun -- run src/cli.ts status`
- Benchmark suite: `nix run nixpkgs#bun -- run src/bench-suite.ts --workspace <path> --profile smoke --cold 1 --warm 1 --strategies mcp_transport,cli_skill`
- Build npm package bundle: `node scripts/build-package.mjs`
- Dry-run npm package tarball: `npm pack --dry-run`
- Validate workflow YAML: `ruby -e 'require "yaml"; %w[ci release publish].each { |n| YAML.load_file(".github/workflows/#{n}.yml") }; puts "ok"'`
- Validate brew script syntax: `node --check scripts/update-homebrew-formula.mjs`

## Lockfiles

- Keep both `bun.lock` and `package-lock.json` in sync.
- `bun.lock` is the primary local dev lockfile for Bun commands.
- `package-lock.json` is required for npm-based CI checks, including `npm audit`.

## Testing

- Always run `nix run nixpkgs#bun -- test ./src/test.ts` after behavior changes.
- For performance or benchmark changes, run at least one fresh suite and update the newest `benchmarks/results/<run-id>/*` artifacts.
- Keep benchmark tables in `BENCHMARKS.md` aligned with the newest `benchmarks/results/<run-id>/results.json`.

## Skill Quality Gate

- After any feature, command, tool, or workflow change, review `skills/CLI/SKILL.md` and `skills/MCP/SKILL.md` before closing the task.
- If behavior, routing, defaults, anti-patterns, or examples changed, update the affected skill files in the same change.
- Treat skill updates as a required quality gate, not optional follow-up.
- If no skill update is needed, explicitly state why in the final task summary.

## Project Structure

- `src/cli.ts`: primary CLI command surface.
- `src/bin.ts`: npm package entrypoint router (top-level CLI + optional `mcp` namespace).
- `src/server.ts`: optional MCP stdio server runtime (`veil mcp server`).
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

See `skills/CLI/SKILL.md` and `skills/MCP/SKILL.md` for routing guidance and anti-patterns.

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

Use `skills/CLI/SKILL.md` for CLI routing and `skills/MCP/SKILL.md` for MCP routing.

## Release Workflow

- Dispatch `Release` workflow from `main` with a bump type to create a `release/vX.Y.Z` PR.
- Merge the PR after CI passes; the `Publish` workflow handles tag, npm, GitHub release, and brew update.
- Required secrets: `NPM_TOKEN`, `RELEASE_PR_TOKEN`, `HOMEBREW_TAP_GITHUB_TOKEN`.
- Branch protection on `main` must require the `CI / test` check context.
- Verify post-publish with npm version lookup, remote tag presence, GitHub release page, and tap formula version/sha alignment.
- If brew update fails after npm publish, keep the existing tag/release and rerun only formula update with the same `TAG` and `VERSION`.
- See `README.md` for full release runbook and variable reference.

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
