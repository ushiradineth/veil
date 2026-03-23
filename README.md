# Veil Agent Toolkit

Veil is an MCP-first retrieval toolkit for coding agents.

It provides one compact tool surface for local code retrieval, git context, web context, and GitHub context.

## Setup

### Run MCP server

```bash
npx -y @ushiradineth/veil@latest
```

### Install MCP skill

```bash
npx -y skills add https://github.com/ushiradineth/veil --skill veil
```

### MCP client configuration

<details>
  <summary>Codex</summary>

```bash
codex mcp add veil -- npx -y @ushiradineth/veil@latest
```

</details>

<details>
  <summary>Claude Code</summary>

```bash
claude mcp add --scope user veil -- npx -y @ushiradineth/veil@latest
```

</details>

<details>
  <summary>OpenCode</summary>

Add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "veil": {
      "type": "local",
      "command": ["npx", "-y", "@ushiradineth/veil@latest"]
    }
  }
}
```

</details>

## Capabilities

| Capability                          | MCP tool                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Index status                        | `veil_status`                                                                             |
| Incremental refresh                 | `veil_refresh`                                                                            |
| Full rebuild                        | `veil_build`                                                                              |
| Discover files/symbols/chunks       | `veil_discover`                                                                           |
| Fetch one chunk by id               | `veil_chunk`                                                                              |
| Intent-aware lookup                 | `veil_lookup`                                                                             |
| File path retrieval                 | `veil_files`                                                                              |
| Symbol retrieval                    | `veil_symbols`                                                                            |
| Content search                      | `veil_search`                                                                             |
| Grammar list/install/remove/update  | `veil_grammar_list`, `veil_grammar_install`, `veil_grammar_remove`, `veil_grammar_update` |
| Grammar recommendation/install plan | `veil_grammar_recommend`                                                                  |
| Grammar runtime package install     | `veil_grammar_runtime_install`                                                            |
| Web search                          | `veil_web_search`                                                                         |
| URL fetch                           | `veil_fetch_url`                                                                          |
| Git status/log/diff/show            | `veil_git_status`, `veil_git_log`, `veil_git_diff`, `veil_git_show`                       |
| GitHub context lookup               | `veil_gh_lookup`                                                                          |
| Diagnostics                         | `veil_diagnostics`                                                                        |

## Optional parser runtimes

- Core defaults stay minimal: `javascript`, `typescript`, `json`.
- Additional languages are optional and install only after explicit user approval via
  `veil_grammar_runtime_install`.
- Common optional coverage includes:
  - `nix`, `elixir`, `zig`, `go`, `rust`
  - `c`, `cpp`, `c-sharp`
  - `markdown`
  - `java`, `php`, `ruby`, `lua`, `kotlin`, `swift`

### Runtime install reuse semantics

- Parser enable or install state is persisted in `<state_root>/grammars.json` (default state root: `.veil`).
- Runtime packages are installed into `<state_root>/grammars-runtime` for that workspace.
- Separate MCP server instances reuse the same runtime install location when they target the same workspace and
  state root.
- Fallback policy is strict for known installable parsers: global fallback is only allowed when runtime install is
  recorded as failed (`runtime_install_failed`) or when no known runtime package mapping exists.

## Note

> Veil is still experimental and under active development. Please report any issues or suggestions.
