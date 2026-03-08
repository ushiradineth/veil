import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";

import { diagnostics } from "./diagnostics";
import { buildIndex, getStatus } from "./indexer";
import { resolveStateRoot } from "./state-root";
import type {
  GhLookupData,
  GhLookupKind,
  GitDiffData,
  GitLogData,
  GitLogEntry,
  GitShowData,
  GitStatusData,
  GitToolError,
  GitToolName,
  GitToolResponse,
} from "./types";

type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  error?: string;
  errorCode?: string;
};

type RunnerOptions = {
  command?: string;
  timeoutMs: number;
};

const DEFAULT_MAX_BYTES = 64_000;
const MAX_BYTES_CAP = 500_000;

function nowMs(bunRef?: { nanoseconds?: () => number }): number {
  if (process.env.VEIL_FORCE_DATE_NOW === "1") {
    return Date.now();
  }
  const runtimeBun = bunRef ?? (globalThis as { Bun?: { nanoseconds?: () => number } }).Bun;
  if (runtimeBun && typeof runtimeBun.nanoseconds === "function") {
    return runtimeBun.nanoseconds() / 1_000_000;
  }
  return Date.now();
}

export const __internalGit = {
  nowMs,
  runCommand,
  validatePathArg,
  validateRevision,
};

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number): RunResult {
  const started = nowMs();
  try {
    const out = spawnSync(command, args, {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: timeoutMs,
    });
    const elapsed = nowMs() - started;
    const timedOut = (out.signal === "SIGTERM" && out.status === null) || elapsed > timeoutMs;
    return {
      ok: out.status === 0 && !out.error && !timedOut,
      stdout: out.stdout,
      stderr: out.stderr,
      code: out.status,
      timedOut,
      error: out.error?.message,
      errorCode: (out.error as { code?: string } | undefined)?.code,
    };
  } catch (error) {
    const value = error as { message?: string; code?: string };
    return {
      ok: false,
      stdout: "",
      stderr: "",
      code: null,
      timedOut: false,
      error: value.message ?? String(error),
      errorCode: value.code,
    };
  }
}

function isMissingBinary(result: RunResult): boolean {
  if (result.errorCode === "ENOENT") return true;
  if (!result.error) return false;
  return (
    result.error.includes("ENOENT") ||
    result.error.includes("Executable not found in $PATH") ||
    result.error.includes("No such file or directory")
  );
}

function responseMeta(
  workspace: string,
  tool: GitToolName,
  started: number,
  truncated: boolean,
  warnings: string[],
) {
  return {
    ok: true,
    workspace,
    tool,
    git_available: true,
    duration_ms: Number((nowMs() - started).toFixed(4)),
    truncated,
    warnings,
  };
}

function fail<T>(
  workspace: string,
  tool: GitToolName,
  started: number,
  error: GitToolError,
  gitAvailable = true,
): GitToolResponse<T> {
  return {
    meta: {
      ok: false,
      workspace,
      tool,
      git_available: gitAvailable,
      duration_ms: Number((nowMs() - started).toFixed(4)),
      truncated: false,
      warnings: [],
    },
    data: null,
    error,
  };
}

function truncateText(
  raw: string,
  maxBytes?: number,
): { text: string; truncated: boolean; warning?: string } {
  const safeMax = Math.max(1024, Math.min(maxBytes ?? DEFAULT_MAX_BYTES, MAX_BYTES_CAP));
  const bytes = Buffer.byteLength(raw, "utf-8");
  if (bytes <= safeMax) {
    return { text: raw.trim(), truncated: false };
  }
  const sliced = Buffer.from(raw, "utf-8").subarray(0, safeMax).toString("utf-8");
  return {
    text: sliced.trim(),
    truncated: true,
    warning: `output truncated to ${String(safeMax)} bytes`,
  };
}

/**
 * Validates a path argument to prevent path traversal attacks.
 *
 * Security checks:
 * - Rejects absolute paths
 * - Rejects paths starting with hyphen (option injection)
 * - Rejects paths containing null bytes
 * - Normalizes path and checks for workspace escape
 * - Resolves symlinks to prevent escape via symbolic links
 * - Handles unicode path confusion attacks
 */
function validatePathArg(
  workspace: string,
  path?: string,
): { ok: true; value?: string } | { ok: false; error: GitToolError } {
  if (!path) return { ok: true };

  // Null byte check
  if (path.includes("\u0000")) {
    return { ok: false, error: { code: "invalid-path", message: "Path contains null bytes" } };
  }

  // Leading hyphen check (prevents option injection)
  if (path.startsWith("-")) {
    return { ok: false, error: { code: "invalid-path", message: "Path cannot start with hyphen" } };
  }

  // Absolute path check
  if (isAbsolute(path)) {
    return {
      ok: false,
      error: { code: "invalid-path", message: "Path must be a relative path inside workspace" },
    };
  }

  // Normalize and resolve path
  const normalized = normalize(path);
  const abs = resolve(workspace, normalized);

  // Check for workspace escape before symlink resolution
  const rel = relative(workspace, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, error: { code: "invalid-path", message: "Path escapes workspace" } };
  }

  // Symlink resolution check
  try {
    // Resolve symlinks in both workspace and target path
    const workspaceReal = realpathSync(workspace);
    let absReal = abs;
    try {
      absReal = realpathSync(abs);
    } catch {
      // Path doesn't exist yet, check parent directory
      const parentDir = dirname(abs);
      try {
        const parentReal = realpathSync(parentDir);
        absReal = resolve(parentReal, basename(abs));
      } catch {
        // Parent doesn't exist, use resolved path
        absReal = abs;
      }
    }

    // Verify resolved path is still within workspace
    const relReal = relative(workspaceReal, absReal);
    if (relReal.startsWith("..") || isAbsolute(relReal)) {
      return {
        ok: false,
        error: { code: "invalid-path", message: "Path escapes workspace via symlink" },
      };
    }
  } catch {
    // If realpath fails, fall back to normalized path check
    const workspaceResolved = resolve(workspace);
    const absResolved = resolve(workspace, normalized);
    const relResolved = relative(workspaceResolved, absResolved);
    if (relResolved.startsWith("..") || isAbsolute(relResolved)) {
      return { ok: false, error: { code: "invalid-path", message: "Path escapes workspace" } };
    }
  }

  return { ok: true, value: normalized };
}

/**
 * Validates a git revision string to prevent command injection.
 *
 * Safe character set: alphanumeric, underscore, dot, slash, hyphen, tilde, caret.
 * Allows range syntax with double/triple dots (e.g., HEAD~1..HEAD, main...feature).
 *
 * Rejects:
 * - Null bytes and control characters
 * - Shell metacharacters: ; | & $ ` ( ) { } [ ] < > ! \ " '
 * - Whitespace (spaces, tabs, newlines)
 * - Leading hyphens (option injection)
 * - Strings longer than 200 characters
 */
function validateRevision(
  rev?: string,
): { ok: true; value?: string } | { ok: false; error: GitToolError } {
  if (!rev) return { ok: true };

  // Length check
  if (rev.length > 200) {
    return {
      ok: false,
      error: { code: "invalid-revision", message: "Revision string too long (max 200 characters)" },
    };
  }

  // Leading hyphen check (prevents option injection)
  if (rev.startsWith("-")) {
    return {
      ok: false,
      error: { code: "invalid-revision", message: "Revision cannot start with hyphen" },
    };
  }

  // Null byte and control character check
  const hasControlChar = Array.from(rev).some((ch) => {
    const code = ch.charCodeAt(0);
    return code === 0 || (code >= 1 && code <= 31);
  });
  if (hasControlChar) {
    return {
      ok: false,
      error: {
        code: "invalid-revision",
        message: "Revision contains null bytes or control characters",
      },
    };
  }

  // Whitespace check (spaces, tabs, newlines)
  if (/\s/.test(rev)) {
    return {
      ok: false,
      error: { code: "invalid-revision", message: "Revision contains whitespace" },
    };
  }

  // Shell metacharacter check: ; | & $ ` ( ) { } [ ] < > ! \ " '
  if (/[;|&$`(){}[\]<>!\\'"]/.test(rev)) {
    return {
      ok: false,
      error: { code: "invalid-revision", message: "Revision contains shell metacharacters" },
    };
  }

  // Safe character set: alphanumeric, underscore, dot, slash, hyphen, tilde, caret
  // Allows range syntax with double/triple dots
  const safeRefPattern = /^[A-Za-z0-9._/\-~^]+(\.{2,3}[A-Za-z0-9._/\-~^]+)?$/;
  if (!safeRefPattern.test(rev)) {
    return {
      ok: false,
      error: { code: "invalid-revision", message: "Revision contains unsafe characters" },
    };
  }

  return { ok: true, value: rev };
}

function ensureGitRepo(
  workspace: string,
  options: RunnerOptions,
): { ok: true } | { ok: false; error: GitToolError; gitAvailable: boolean } {
  const probe = runCommand(
    options.command ?? "git",
    ["-C", workspace, "rev-parse", "--is-inside-work-tree"],
    workspace,
    options.timeoutMs,
  );
  if (isMissingBinary(probe)) {
    return {
      ok: false,
      error: { code: "git-unavailable", message: "git is not available in PATH" },
      gitAvailable: false,
    };
  }
  if (!probe.ok) {
    return {
      ok: false,
      error: { code: "not-a-repo", message: "Workspace is not a git repository" },
      gitAvailable: true,
    };
  }
  const top = runCommand(
    options.command ?? "git",
    ["-C", workspace, "rev-parse", "--show-toplevel"],
    workspace,
    options.timeoutMs,
  );
  if (!top.ok) {
    return {
      ok: false,
      error: { code: "not-a-repo", message: "Workspace is not a git repository" },
      gitAvailable: true,
    };
  }
  let workspaceReal = workspace;
  let topReal = top.stdout.trim();
  try {
    workspaceReal = realpathSync(workspace);
    topReal = realpathSync(topReal);
  } catch {
    workspaceReal = resolve(workspace);
    topReal = resolve(topReal);
  }
  const fromTop = relative(topReal, workspaceReal);
  if (fromTop.startsWith("..") || isAbsolute(fromTop)) {
    return {
      ok: false,
      error: { code: "not-a-repo", message: "Workspace is outside git repository root" },
      gitAvailable: true,
    };
  }
  return { ok: true };
}

function parsePorcelain(raw: string): GitStatusData["paths"] {
  const staged = new Set<string>();
  const unstaged = new Set<string>();
  const untracked = new Set<string>();
  for (const line of raw.split("\n")) {
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    const path = line.slice(3).trim();
    if (!path) continue;
    if (x === "?" && y === "?") {
      untracked.add(path);
      continue;
    }
    if (x !== " ") staged.add(path);
    if (y !== " ") unstaged.add(path);
  }
  return {
    staged: [...staged],
    unstaged: [...unstaged],
    untracked: [...untracked],
  };
}

function parseLog(raw: string): GitLogEntry[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [commit, author, date, subject, parentsRaw] = line.split("\t");
      const parentsField = typeof parentsRaw === "string" ? parentsRaw : "";
      return {
        commit,
        author,
        date,
        subject,
        parents: parentsField.split(" ").filter(Boolean),
      };
    });
}

function finish<T>(
  workspace: string,
  tool: GitToolName,
  started: number,
  data: T,
  truncation: { truncated: boolean; warning?: string },
): GitToolResponse<T> {
  const warnings = truncation.warning ? [truncation.warning] : [];
  return {
    meta: responseMeta(workspace, tool, started, truncation.truncated, warnings),
    data,
    error: null,
  };
}

function recordDiagnostics(
  tool: GitToolName,
  started: number,
  ok: boolean,
  timedOut: boolean,
): void {
  const elapsed = nowMs() - started;
  const isGh = tool === "gh_lookup";
  diagnostics.recordGitCall(elapsed, ok, timedOut, isGh);
}

export function gitStatus(
  workspace: string,
  options?: { timeout_ms?: number; command?: string },
): GitToolResponse<GitStatusData> {
  const started = nowMs();
  const timeoutMs = Math.min(10_000, Math.max(500, options?.timeout_ms ?? 5_000));
  const runner = { timeoutMs, command: options?.command };
  const repoCheck = ensureGitRepo(workspace, runner);
  if (!repoCheck.ok) {
    recordDiagnostics("git_status", started, false, false);
    return fail(workspace, "git_status", started, repoCheck.error, repoCheck.gitAvailable);
  }

  const branch = runCommand(
    runner.command ?? "git",
    ["-C", workspace, "rev-parse", "--abbrev-ref", "HEAD"],
    workspace,
    timeoutMs,
  );
  const head = runCommand(
    runner.command ?? "git",
    ["-C", workspace, "rev-parse", "HEAD"],
    workspace,
    timeoutMs,
  );
  const upstream = runCommand(
    runner.command ?? "git",
    ["-C", workspace, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    workspace,
    timeoutMs,
  );
  const aheadBehind = runCommand(
    runner.command ?? "git",
    ["-C", workspace, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    workspace,
    timeoutMs,
  );
  const porcelain = runCommand(
    runner.command ?? "git",
    ["-C", workspace, "status", "--porcelain"],
    workspace,
    timeoutMs,
  );

  if (!branch.ok || !head.ok || !porcelain.ok) {
    const timedOut = branch.timedOut || head.timedOut || porcelain.timedOut;
    recordDiagnostics("git_status", started, false, timedOut);
    return fail(workspace, "git_status", started, {
      code: timedOut ? "timeout" : "command-failed",
      message: `Failed to gather git status: ${(branch.stderr || head.stderr || porcelain.stderr || "unknown").trim()}`,
    });
  }

  const paths = parsePorcelain(porcelain.stdout);
  const [behindRaw, aheadRaw] = (aheadBehind.stdout.trim() || "0 0").split("\t");
  const data: GitStatusData = {
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    upstream: upstream.ok ? upstream.stdout.trim() : null,
    ahead: Number(aheadRaw || "0") || 0,
    behind: Number(behindRaw || "0") || 0,
    dirty: paths.staged.length + paths.unstaged.length + paths.untracked.length > 0,
    changed: {
      staged: paths.staged.length,
      unstaged: paths.unstaged.length,
      untracked: paths.untracked.length,
    },
    paths,
  };
  recordDiagnostics("git_status", started, true, false);
  return finish(workspace, "git_status", started, data, { truncated: false });
}

export function gitLog(
  workspace: string,
  options?: {
    limit?: number;
    since?: string;
    author?: string;
    grep?: string;
    timeout_ms?: number;
    command?: string;
  },
): GitToolResponse<GitLogData> {
  const started = nowMs();
  const timeoutMs = Math.min(12_000, Math.max(500, options?.timeout_ms ?? 8_000));
  const runner = { timeoutMs, command: options?.command };
  const repoCheck = ensureGitRepo(workspace, runner);
  if (!repoCheck.ok) {
    recordDiagnostics("git_log", started, false, false);
    return fail(workspace, "git_log", started, repoCheck.error, repoCheck.gitAvailable);
  }

  const limit = Math.min(200, Math.max(1, options?.limit ?? 30));
  const args = [
    "-C",
    workspace,
    "log",
    `-n${String(limit)}`,
    "--date=iso-strict",
    "--pretty=format:%H%x09%an%x09%ad%x09%s%x09%P",
  ];
  if (options?.since) args.push(`--since=${options.since}`);
  if (options?.author) args.push(`--author=${options.author}`);
  if (options?.grep) args.push(`--grep=${options.grep}`);

  const out = runCommand(runner.command ?? "git", args, workspace, timeoutMs);
  if (!out.ok) {
    recordDiagnostics("git_log", started, false, out.timedOut);
    return fail(workspace, "git_log", started, {
      code: out.timedOut ? "timeout" : "command-failed",
      message: `git log failed: ${out.stderr.trim() !== "" ? out.stderr.trim() : (out.error ?? "unknown")}`,
    });
  }

  const entries = parseLog(out.stdout);
  recordDiagnostics("git_log", started, true, false);
  return finish(workspace, "git_log", started, { limit, entries }, { truncated: false });
}

export function gitDiff(
  workspace: string,
  options?: {
    staged?: boolean;
    path?: string;
    base?: string;
    head?: string;
    name_only?: boolean;
    timeout_ms?: number;
    max_bytes?: number;
    command?: string;
  },
): GitToolResponse<GitDiffData> {
  const started = nowMs();
  const timeoutMs = Math.min(10_000, Math.max(500, options?.timeout_ms ?? 5_000));
  const runner = { timeoutMs, command: options?.command };
  const repoCheck = ensureGitRepo(workspace, runner);
  if (!repoCheck.ok) {
    recordDiagnostics("git_diff", started, false, false);
    return fail(workspace, "git_diff", started, repoCheck.error, repoCheck.gitAvailable);
  }

  const baseValidated = validateRevision(options?.base);
  if (!baseValidated.ok) {
    recordDiagnostics("git_diff", started, false, false);
    return fail(workspace, "git_diff", started, baseValidated.error);
  }
  const headValidated = validateRevision(options?.head);
  if (!headValidated.ok) {
    recordDiagnostics("git_diff", started, false, false);
    return fail(workspace, "git_diff", started, headValidated.error);
  }
  const pathValidated = validatePathArg(workspace, options?.path);
  if (!pathValidated.ok) {
    recordDiagnostics("git_diff", started, false, false);
    return fail(workspace, "git_diff", started, pathValidated.error);
  }

  const args = ["-C", workspace, "diff"];
  if (options?.staged) args.push("--cached");
  if (options?.name_only) args.push("--name-only");

  const baseValue = baseValidated.value;
  const headValue = headValidated.value;
  const hasRange = Boolean(baseValue && headValue);
  if (baseValue && headValue) {
    args.push(`${baseValue}..${headValue}`);
  } else if (baseValue) {
    args.push(baseValue);
  }
  if (pathValidated.value) {
    args.push("--", pathValidated.value);
  }

  const out = runCommand(runner.command ?? "git", args, workspace, timeoutMs);
  if (!out.ok) {
    recordDiagnostics("git_diff", started, false, out.timedOut);
    return fail(workspace, "git_diff", started, {
      code: out.timedOut ? "timeout" : "command-failed",
      message: `git diff failed: ${out.stderr.trim() !== "" ? out.stderr.trim() : (out.error ?? "unknown")}`,
    });
  }

  const truncation = truncateText(out.stdout, options?.max_bytes);
  const data: GitDiffData = {
    mode: hasRange ? "range" : "working",
    staged: Boolean(options?.staged),
    name_only: Boolean(options?.name_only),
    base: baseValidated.value ?? null,
    head: headValidated.value ?? null,
    path: pathValidated.value ?? null,
    text: truncation.text,
  };
  recordDiagnostics("git_diff", started, true, false);
  return finish(workspace, "git_diff", started, data, truncation);
}

export function gitShow(
  workspace: string,
  options?: {
    rev: string;
    path?: string;
    patch?: boolean;
    max_bytes?: number;
    timeout_ms?: number;
    command?: string;
  },
): GitToolResponse<GitShowData> {
  const started = nowMs();
  const timeoutMs = Math.min(12_000, Math.max(500, options?.timeout_ms ?? 8_000));
  const runner = { timeoutMs, command: options?.command };
  const repoCheck = ensureGitRepo(workspace, runner);
  if (!repoCheck.ok) {
    recordDiagnostics("git_show", started, false, false);
    return fail(workspace, "git_show", started, repoCheck.error, repoCheck.gitAvailable);
  }

  const revValidated = validateRevision(options?.rev);
  if (!revValidated.ok || !revValidated.value) {
    recordDiagnostics("git_show", started, false, false);
    return fail(
      workspace,
      "git_show",
      started,
      revValidated.ok
        ? { code: "invalid-revision", message: "Revision is required" }
        : revValidated.error,
    );
  }
  const pathValidated = validatePathArg(workspace, options?.path);
  if (!pathValidated.ok) {
    recordDiagnostics("git_show", started, false, false);
    return fail(workspace, "git_show", started, pathValidated.error);
  }

  const args = [
    "-C",
    workspace,
    "show",
    revValidated.value,
    "--date=iso-strict",
    "--pretty=fuller",
  ];
  if (options?.patch === false) {
    args.push("--no-patch");
  }
  if (pathValidated.value) {
    args.push("--", pathValidated.value);
  }

  const out = runCommand(runner.command ?? "git", args, workspace, timeoutMs);
  if (!out.ok) {
    const invalidRevision =
      out.stderr.includes("bad revision") || out.stderr.includes("unknown revision");
    recordDiagnostics("git_show", started, false, out.timedOut);
    return fail(workspace, "git_show", started, {
      code: out.timedOut ? "timeout" : invalidRevision ? "invalid-revision" : "command-failed",
      message: `git show failed: ${out.stderr.trim() !== "" ? out.stderr.trim() : (out.error ?? "unknown")}`,
    });
  }

  const truncation = truncateText(out.stdout, options?.max_bytes);
  const data: GitShowData = {
    rev: revValidated.value,
    path: pathValidated.value ?? null,
    patch: options?.patch !== false,
    text: truncation.text,
  };
  recordDiagnostics("git_show", started, true, false);
  return finish(workspace, "git_show", started, data, truncation);
}

export function ghLookup(
  workspace: string,
  options: {
    repo: string;
    kind: GhLookupKind;
    query?: string;
    limit?: number;
    timeout_ms?: number;
    command?: string;
    temp_root?: string;
    state_root?: string;
  },
): Promise<GitToolResponse<GhLookupData>> {
  const started = nowMs();
  const timeoutMs = Math.min(20_000, Math.max(500, options.timeout_ms ?? 12_000));
  const command = options.command ?? "gh";
  const probe = runCommand(command, ["--version"], workspace, timeoutMs);
  if (isMissingBinary(probe)) {
    recordDiagnostics("gh_lookup", started, false, false);
    return Promise.resolve(
      fail(
        workspace,
        "gh_lookup",
        started,
        { code: "gh-unavailable", message: "gh is not available in PATH" },
        true,
      ),
    );
  }
  if (!probe.ok) {
    recordDiagnostics("gh_lookup", started, false, probe.timedOut);
    return Promise.resolve(
      fail(workspace, "gh_lookup", started, {
        code: probe.timedOut ? "timeout" : "gh-unavailable",
        message: "gh command is unavailable",
      }),
    );
  }

  const auth = runCommand(command, ["auth", "status"], workspace, timeoutMs);
  if (!auth.ok) {
    recordDiagnostics("gh_lookup", started, false, auth.timedOut);
    return Promise.resolve(
      fail(workspace, "gh_lookup", started, {
        code: auth.timedOut ? "timeout" : "gh-unauthenticated",
        message: "gh is unauthenticated or cannot access GitHub",
      }),
    );
  }

  const parseRepoRef = (
    repoRef: string,
  ): { repo: string; owner: string; name: string; url: string } | null => {
    const trimmed = repoRef.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const url = new URL(trimmed);
        const parts = url.pathname
          .replace(/^\/+/, "")
          .replace(/\.git$/, "")
          .split("/")
          .filter(Boolean);
        if (parts.length < 2) return null;
        const owner = parts[0] ?? "";
        const name = parts[1] ?? "";
        if (!owner || !name) return null;
        return {
          repo: `${owner}/${name}`,
          owner,
          name,
          url: `https://github.com/${owner}/${name}.git`,
        };
      } catch {
        return null;
      }
    }
    const normalizedRepo = trimmed.replace(/\.git$/, "");
    const parts = normalizedRepo.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    const owner = parts[0] ?? "";
    const name = parts[1] ?? "";
    if (!owner || !name) return null;
    return {
      repo: `${owner}/${name}`,
      owner,
      name,
      url: `https://github.com/${owner}/${name}.git`,
    };
  };

  const repoRef = parseRepoRef(options.repo);
  if (!repoRef) {
    recordDiagnostics("gh_lookup", started, false, false);
    return Promise.resolve(
      fail(workspace, "gh_lookup", started, {
        code: "command-failed",
        message: "repo must be 'owner/repo' or a GitHub URL",
      }),
    );
  }

  if (options.kind === "repo_context") {
    const gitProbe = runCommand("git", ["--version"], workspace, timeoutMs);
    if (isMissingBinary(gitProbe)) {
      recordDiagnostics("gh_lookup", started, false, false);
      return Promise.resolve(
        fail(
          workspace,
          "gh_lookup",
          started,
          { code: "git-unavailable", message: "git is not available in PATH" },
          false,
        ),
      );
    }
    if (!gitProbe.ok) {
      recordDiagnostics("gh_lookup", started, false, gitProbe.timedOut);
      return Promise.resolve(
        fail(
          workspace,
          "gh_lookup",
          started,
          {
            code: gitProbe.timedOut ? "timeout" : "command-failed",
            message: "git command is unavailable",
          },
          false,
        ),
      );
    }

    const tempRoot = options.temp_root?.trim() ? options.temp_root.trim() : "/tmp";
    const target = join(tempRoot, basename(repoRef.name));
    mkdirSync(tempRoot, { recursive: true });
    const gitDir = join(target, ".git");
    let syncOut: RunResult;
    if (!existsSync(gitDir)) {
      syncOut = runCommand(
        "git",
        ["clone", "--depth", "1", repoRef.url, target],
        workspace,
        timeoutMs,
      );
    } else {
      const remote = runCommand(
        "git",
        ["-C", target, "remote", "set-url", "origin", repoRef.url],
        workspace,
        timeoutMs,
      );
      const fetch = runCommand(
        "git",
        ["-C", target, "fetch", "--depth", "1", "origin"],
        workspace,
        timeoutMs,
      );
      const headRef = runCommand(
        "git",
        ["-C", target, "symbolic-ref", "refs/remotes/origin/HEAD"],
        workspace,
        timeoutMs,
      );
      const branchRef = headRef.ok
        ? headRef.stdout.trim().replace(/^refs\/remotes\//, "")
        : "origin/main";
      const reset = runCommand(
        "git",
        ["-C", target, "reset", "--hard", branchRef],
        workspace,
        timeoutMs,
      );
      syncOut =
        !remote.ok || !fetch.ok || !reset.ok
          ? {
              ok: false,
              stdout: `${remote.stdout}\n${fetch.stdout}\n${reset.stdout}`,
              stderr: `${remote.stderr}\n${fetch.stderr}\n${reset.stderr}`,
              code: 1,
              timedOut: remote.timedOut || fetch.timedOut || reset.timedOut,
            }
          : reset;
    }

    if (!syncOut.ok) {
      recordDiagnostics("gh_lookup", started, false, syncOut.timedOut);
      return Promise.resolve(
        fail(workspace, "gh_lookup", started, {
          code: syncOut.timedOut ? "timeout" : "command-failed",
          message: `failed to sync repo ${repoRef.repo}: ${syncOut.stderr.trim() !== "" ? syncOut.stderr.trim() : (syncOut.error ?? "unknown")}`,
        }),
      );
    }

    return buildIndex(target, "changed", { state_root: options.state_root })
      .then(async () => {
        const status = await getStatus(target, { state_root: options.state_root });
        const stateRootResolved = resolveStateRoot(target, options.state_root);
        const data: GhLookupData = {
          repo: repoRef.repo,
          kind: "repo_context",
          query: options.query ?? "",
          limit: 0,
          text: `repo indexed at ${target}`,
          repo_url: repoRef.url,
          cloned_workspace: target,
          state_root: stateRootResolved,
          status_exists: status.exists,
        };
        recordDiagnostics("gh_lookup", started, true, false);
        return finish(workspace, "gh_lookup", started, data, { truncated: false });
      })
      .catch((error: unknown) => {
        recordDiagnostics("gh_lookup", started, false, false);
        return fail(workspace, "gh_lookup", started, {
          code: "command-failed",
          message: `failed to index cloned repo: ${String(error)}`,
        });
      });
  }

  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const query = options.query ?? "";
  let subcommand = "issue";
  let args: string[];
  if (options.kind === "issues") {
    subcommand = "issue";
    args = ["search", query || "is:open", "--repo", repoRef.repo, "--limit", String(limit)];
  } else if (options.kind === "prs") {
    subcommand = "pr";
    args = ["list", "--repo", repoRef.repo, "--limit", String(limit)];
    if (query) {
      args.push("--search", query);
    }
  } else {
    subcommand = "run";
    args = ["list", "--repo", repoRef.repo, "--limit", String(limit)];
  }

  const out = runCommand(command, [subcommand, ...args], workspace, timeoutMs);
  if (!out.ok) {
    recordDiagnostics("gh_lookup", started, false, out.timedOut);
    return Promise.resolve(
      fail(workspace, "gh_lookup", started, {
        code: out.timedOut ? "timeout" : "command-failed",
        message: `gh lookup failed: ${out.stderr.trim() !== "" ? out.stderr.trim() : (out.error ?? "unknown")}`,
      }),
    );
  }

  const truncation = truncateText(out.stdout, DEFAULT_MAX_BYTES);
  const data: GhLookupData = {
    repo: repoRef.repo,
    kind: options.kind,
    query,
    limit,
    text: truncation.text,
    repo_url: repoRef.url,
  };
  recordDiagnostics("gh_lookup", started, true, false);
  return Promise.resolve(finish(workspace, "gh_lookup", started, data, truncation));
}
