# Veil Agent Guide

## Commands

- Install deps: `nix run nixpkgs#bun -- install`
- Run tests: `nix run nixpkgs#bun -- test ./src/test.ts`
- Run coverage: `nix run nixpkgs#bun -- test --coverage ./src/test.ts`
- MCP server (stdio): `nix run nixpkgs#bun -- run src/bin.ts`
- MCP server (HTTP): `VEIL_HTTP=1 nix run nixpkgs#bun -- run src/bin.ts`
- Benchmark suite: `nix run nixpkgs#bun -- run src/bench-suite.ts --workspace <path> --profile smoke --cold 1 --warm 1 --strategies mcp_transport`
- Build npm package bundle: `node scripts/build-package.mjs`
- Dry-run npm package tarball: `npm pack --dry-run`
- Validate workflow YAML: `ruby -e 'require "yaml"; %w[ci release publish].each { |n| YAML.load_file(".github/workflows/#{n}.yml") }; puts "ok"'`
- Validate brew script syntax: `node --check scripts/update-homebrew-formula.mjs`

## Lockfiles

- Keep both `bun.lock` and `package-lock.json` in sync.
- `bun.lock` is the primary local dev lockfile for Bun commands.
- `package-lock.json` is required for npm-based CI checks, including `npm audit`.

## Testing

- For behavior-changing refactors, follow TDD: write or update a failing test first (Red), implement the smallest change to pass (Green), then refactor with tests still passing (Refactor).
- For MCP contract refactors, keep focused contract regression tests and run targeted test filters when isolating failures.
- Always run `nix run nixpkgs#bun -- test ./src/test.ts` after behavior changes.
- For performance or benchmark changes, run at least one fresh suite and update the newest `benchmarks/results/<run-id>/*` artifacts.
- Keep benchmark tables in `BENCHMARKS.md` aligned with the newest `benchmarks/results/<run-id>/results.json`.

## TDD Workflow

For behavior-changing refactors, use a strict test-first loop:

1. Red: write or update a test that fails for the intended behavior.
2. Green: implement the smallest change that makes the test pass.
3. Refactor: clean up code while keeping the test suite green.

Recommended loop commands:

```bash
nix run nixpkgs#bun -- test ./src/test.ts
nix run nixpkgs#bun -- test --coverage ./src/test.ts
```

For docs-only, release-note, or non-behavioral chore changes, mark TDD as not applicable in the PR checklist.

## Skill Quality Gate

- After any feature, command, tool, or workflow change, review `skills/SKILL.md` before closing the task.
- If behavior, routing, defaults, anti-patterns, or examples changed, update the skill file in the same change.
- If the skill file changes, bump its frontmatter `version` using semver (`major.minor.patch`) in the same change.
- Treat skill updates as a required quality gate, not optional follow-up.
- If no skill update is needed, explicitly state why in the final task summary.

## Project Structure

- `src/bin.ts`: npm package entrypoint that starts MCP runtime.
- `src/server.ts`: MCP runtime (stdio default, optional streamable HTTP).
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
- MCP text output must stay TOON-formatted.
- Avoid ad hoc shell parsing when a typed utility exists.

## Token Sensitivity

- This project is for agents. Optimize for low token usage.
- Be as descriptive as needed for correct execution, then stop.
- Prefer short, directive wording over narrative explanations.
- Avoid repeating context already present in prompts, tool schemas, or command output.
- Keep skill and onboarding artifacts compact and operational.
- Keep tool descriptions and guidance text compact by default to reduce token overhead.

## MCP Routing Policy

See `skills/SKILL.md` for routing guidance and anti-patterns.

## Skill Maintenance Gates

- For MCP server, MCP tool, or MCP routing changes, load and follow `mcp-builder`.
- For skill artifact changes under `skills/**`, load and follow `skill-creator`.
- If a change affects both skill artifacts and MCP behavior, use both workflows and keep guidance and capability claims aligned.
- Do not close MCP or skill change work without checking whether `skills/SKILL.md` needs updates.

## No-Skill Defaults

- MCP tool descriptions are intent-first and should be treated as the primary no-skill routing surface for generic agents.
- Default objective is native-first Veil selection across all replaceable workflows (local retrieval, git context, web/fetch, GitHub context).
- Query tools (`files`, `symbols`, `search`, `lookup`) auto-refresh stale indexes by default.
- No project-specific environment variables are required for normal operation.

## Skill Trigger (Operational)

When a prompt includes words like `research`, `investigate`, `find where`, `summarize from web`, or `compare docs`, apply:

1. `veil_discover` for local context
2. `veil_web_search` for external candidates
3. `veil_fetch_url` for top URLs
4. Return concise synthesis with source URLs

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

- Prefer Veil MCP tools over shell equivalents for supported intents.
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
