import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { resolveStateRoot } from "./state-root";

export type BuiltinParserId =
  | "javascript"
  | "typescript"
  | "python"
  | "json"
  | "bash"
  | "go"
  | "rust";

export type ParserId = string;

export type SupportedLanguageId =
  | "javascript"
  | "typescript"
  | "json"
  | "python"
  | "shell"
  | "go"
  | "rust";

export type LanguageSupportEntry = {
  id: SupportedLanguageId;
  parser_id: ParserId;
  runtime_package: string | null;
  extensions: string[];
  installable: boolean;
  core_default: boolean;
};

export type ParserCatalogEntry = {
  id: BuiltinParserId;
  aliases: string[];
  label: string;
  default_enabled: boolean;
  runtime_package: string | null;
  core_default: boolean;
};

type ParserState = {
  version: 1;
  enabled: ParserId[];
  installed: ParserId[];
};

const PARSER_STATE_FILE = "grammars.json";
const require = createRequire(import.meta.url);
const DEFAULT_INSTALL_TIMEOUT_MS = 120_000;
const MAX_INSTALL_OUTPUT_BYTES = 2_000_000;

export const BUILTIN_PARSERS: ParserCatalogEntry[] = [
  {
    id: "javascript",
    aliases: ["js", "javascript"],
    label: "JavaScript",
    default_enabled: true,
    runtime_package: "tree-sitter-javascript",
    core_default: true,
  },
  {
    id: "typescript",
    aliases: ["ts", "typescript"],
    label: "TypeScript",
    default_enabled: true,
    runtime_package: "tree-sitter-typescript",
    core_default: true,
  },
  {
    id: "python",
    aliases: ["py", "python"],
    label: "Python",
    default_enabled: false,
    runtime_package: "tree-sitter-python",
    core_default: false,
  },
  {
    id: "json",
    aliases: ["json"],
    label: "JSON",
    default_enabled: true,
    runtime_package: null,
    core_default: true,
  },
  {
    id: "bash",
    aliases: ["bash", "sh", "shell"],
    label: "Bash",
    default_enabled: false,
    runtime_package: "tree-sitter-bash",
    core_default: false,
  },
  {
    id: "go",
    aliases: ["go", "golang"],
    label: "Go",
    default_enabled: false,
    runtime_package: "tree-sitter-go",
    core_default: false,
  },
  {
    id: "rust",
    aliases: ["rust", "rs"],
    label: "Rust",
    default_enabled: false,
    runtime_package: "tree-sitter-rust",
    core_default: false,
  },
];

export const LANGUAGE_SUPPORT_CATALOG: LanguageSupportEntry[] = [
  {
    id: "javascript",
    parser_id: "javascript",
    runtime_package: "tree-sitter-javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    installable: false,
    core_default: true,
  },
  {
    id: "typescript",
    parser_id: "typescript",
    runtime_package: "tree-sitter-typescript",
    extensions: [".ts", ".tsx"],
    installable: false,
    core_default: true,
  },
  {
    id: "json",
    parser_id: "json",
    runtime_package: null,
    extensions: [".json"],
    installable: false,
    core_default: true,
  },
  {
    id: "python",
    parser_id: "python",
    runtime_package: "tree-sitter-python",
    extensions: [".py"],
    installable: true,
    core_default: false,
  },
  {
    id: "shell",
    parser_id: "bash",
    runtime_package: "tree-sitter-bash",
    extensions: [".sh"],
    installable: true,
    core_default: false,
  },
  {
    id: "go",
    parser_id: "go",
    runtime_package: "tree-sitter-go",
    extensions: [".go"],
    installable: true,
    core_default: false,
  },
  {
    id: "rust",
    parser_id: "rust",
    runtime_package: "tree-sitter-rust",
    extensions: [".rs"],
    installable: true,
    core_default: false,
  },
];

const LANGUAGE_SUPPORT_BY_ID = new Map(LANGUAGE_SUPPORT_CATALOG.map((entry) => [entry.id, entry]));
const RUNTIME_PACKAGE_BY_PARSER = new Map(
  BUILTIN_PARSERS.filter((entry) => entry.runtime_package).map((entry) => [
    entry.id,
    entry.runtime_package as string,
  ]),
);

const BUILTIN_ID_SET = new Set(BUILTIN_PARSERS.map((entry) => entry.id));

function parserStatePath(workspace: string, stateRoot?: string): string {
  return `${resolveStateRoot(workspace, stateRoot)}/${PARSER_STATE_FILE}`;
}

function defaultState(): ParserState {
  const defaults = BUILTIN_PARSERS.filter((entry) => entry.default_enabled).map(
    (entry) => entry.id,
  );
  return {
    version: 1,
    enabled: defaults,
    installed: defaults,
  };
}

function normalizeState(value: unknown): ParserState {
  const fallback = defaultState();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as {
    enabled?: unknown;
    installed?: unknown;
    version?: unknown;
  };
  const pick = (items: unknown): ParserId[] => {
    if (!Array.isArray(items)) return [];
    const out: ParserId[] = [];
    for (const item of items) {
      if (typeof item !== "string") continue;
      const normalized = normalizeParserId(item);
      if (!normalized) continue;
      if (!out.includes(normalized)) out.push(normalized);
    }
    return out;
  };
  const enabled = pick(raw.enabled);
  const installed = pick(raw.installed);
  const normalized: ParserState = {
    version: raw.version === 1 ? 1 : 1,
    enabled: enabled.length > 0 ? enabled : fallback.enabled,
    installed: installed.length > 0 ? installed : fallback.installed,
  };
  return normalized;
}

async function readState(workspace: string, stateRoot?: string): Promise<ParserState> {
  const p = parserStatePath(workspace, stateRoot);
  if (!existsSync(p)) return defaultState();
  try {
    const raw = await readFile(p, "utf-8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

async function writeState(
  workspace: string,
  state: ParserState,
  stateRoot?: string,
): Promise<void> {
  const root = resolveStateRoot(workspace, stateRoot);
  await mkdir(root, { recursive: true });
  await writeFile(
    parserStatePath(workspace, stateRoot),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf-8",
  );
}

export function normalizeParserId(value: string): ParserId | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  for (const entry of BUILTIN_PARSERS) {
    if (entry.id === normalized) return entry.id;
    if (entry.aliases.includes(normalized)) return entry.id;
  }
  if (normalized.startsWith("tree-sitter-")) {
    const derived = normalized.slice("tree-sitter-".length);
    return /^[a-z0-9][a-z0-9-]*$/.test(derived) ? derived : null;
  }
  if (/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    return normalized;
  }
  return null;
}

export function parseParserList(raw: string): ParserId[] {
  const values = raw
    .split(",")
    .map((item) => normalizeParserId(item))
    .filter((item): item is ParserId => Boolean(item));
  return [...new Set(values)];
}

export async function getParserConfig(
  workspace: string,
  stateRoot?: string,
): Promise<{ enabled: ParserId[]; installed: ParserId[] }> {
  const state = await readState(workspace, stateRoot);
  return { enabled: state.enabled, installed: state.installed };
}

export async function setEnabledParsers(
  workspace: string,
  enabled: ParserId[],
  stateRoot?: string,
): Promise<{ enabled: ParserId[]; installed: ParserId[] }> {
  const state = await readState(workspace, stateRoot);
  const nextEnabled = [
    ...new Set(enabled.map((item) => normalizeParserId(item)).filter(Boolean)),
  ] as ParserId[];
  const nextInstalled = [...new Set([...state.installed, ...nextEnabled])];
  const nextState: ParserState = {
    version: 1,
    enabled: nextEnabled,
    installed: nextInstalled,
  };
  await writeState(workspace, nextState, stateRoot);
  return { enabled: nextState.enabled, installed: nextState.installed };
}

export async function installParsers(
  workspace: string,
  parserIds: ParserId[],
  stateRoot?: string,
): Promise<{ enabled: ParserId[]; installed: ParserId[] }> {
  const state = await readState(workspace, stateRoot);
  const add = parserIds
    .map((item) => normalizeParserId(item))
    .filter((item): item is ParserId => Boolean(item));
  const installed = [...new Set([...state.installed, ...add])];
  const enabled = [...new Set([...state.enabled, ...add])];
  const nextState: ParserState = { version: 1, enabled, installed };
  await writeState(workspace, nextState, stateRoot);
  return { enabled: nextState.enabled, installed: nextState.installed };
}

export async function removeParsers(
  workspace: string,
  parserIds: ParserId[],
  stateRoot?: string,
): Promise<{ enabled: ParserId[]; installed: ParserId[] }> {
  const state = await readState(workspace, stateRoot);
  const remove = new Set(parserIds);
  const enabled = state.enabled.filter((item) => !remove.has(item));
  const installed = state.installed.filter((item) => !remove.has(item));
  const nextState: ParserState = { version: 1, enabled, installed };
  await writeState(workspace, nextState, stateRoot);
  return { enabled: nextState.enabled, installed: nextState.installed };
}

export async function updateParsers(
  workspace: string,
  parserIds: ParserId[] | "all",
  stateRoot?: string,
): Promise<{
  enabled: ParserId[];
  installed: ParserId[];
  updated: ParserId[];
}> {
  const state = await readState(workspace, stateRoot);
  const updated =
    parserIds === "all" ? state.installed : state.installed.filter((id) => parserIds.includes(id));
  return { enabled: state.enabled, installed: state.installed, updated };
}

export async function listParsers(
  workspace: string,
  stateRoot?: string,
): Promise<(ParserCatalogEntry & { enabled: boolean; installed: boolean })[]> {
  const state = await readState(workspace, stateRoot);
  const enabledSet = new Set(state.enabled);
  const installedSet = new Set(state.installed);
  return BUILTIN_PARSERS.map((entry) => ({
    ...entry,
    enabled: enabledSet.has(entry.id),
    installed: installedSet.has(entry.id),
  }));
}

export function runtimePackageForParser(parserId: ParserId): string | null {
  const normalized = normalizeParserId(parserId);
  if (!normalized) return null;
  if (BUILTIN_ID_SET.has(normalized as BuiltinParserId)) {
    return RUNTIME_PACKAGE_BY_PARSER.get(normalized as BuiltinParserId) ?? null;
  }
  return `tree-sitter-${normalized}`;
}

export function runtimePackageInstalled(parserId: ParserId): boolean {
  const runtimePackage = runtimePackageForParser(parserId);
  if (!runtimePackage) return true;
  try {
    require.resolve(runtimePackage);
    return true;
  } catch {
    return false;
  }
}

export function languageSupportById(language: string): LanguageSupportEntry | null {
  const normalized = language.trim().toLowerCase() as SupportedLanguageId;
  return LANGUAGE_SUPPORT_BY_ID.get(normalized) ?? null;
}

function parserInstallableRuntimePackage(parserId: ParserId): string | null {
  const languageSupport = LANGUAGE_SUPPORT_CATALOG.find((entry) => entry.parser_id === parserId);
  if (languageSupport) {
    if (!languageSupport.installable) return null;
    return languageSupport.runtime_package;
  }
  return runtimePackageForParser(parserId);
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  exit_code: number | null;
  error?: string;
}> {
  return await new Promise((resolveResult) => {
    let resolved = false;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const appendWithCap = (
      chunk: string,
      current: string,
      currentBytes: number,
    ): { next: string; bytes: number } => {
      if (currentBytes >= MAX_INSTALL_OUTPUT_BYTES) {
        return { next: current, bytes: currentBytes };
      }
      const chunkBytes = Buffer.byteLength(chunk, "utf-8");
      const nextBytes = currentBytes + chunkBytes;
      if (nextBytes <= MAX_INSTALL_OUTPUT_BYTES) {
        return { next: current + chunk, bytes: nextBytes };
      }
      const allowed = MAX_INSTALL_OUTPUT_BYTES - currentBytes;
      const clipped = Buffer.from(chunk, "utf-8").subarray(0, allowed).toString("utf-8");
      return { next: current + clipped, bytes: MAX_INSTALL_OUTPUT_BYTES };
    };

    const resolveOnce = (value: {
      ok: boolean;
      stdout: string;
      stderr: string;
      timed_out: boolean;
      exit_code: number | null;
      error?: string;
    }): void => {
      if (resolved) return;
      resolved = true;
      resolveResult(value);
    };

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      const next = appendWithCap(chunk, stdout, stdoutBytes);
      stdout = next.next;
      stdoutBytes = next.bytes;
    });
    child.stderr.on("data", (chunk: string) => {
      const next = appendWithCap(chunk, stderr, stderrBytes);
      stderr = next.next;
      stderrBytes = next.bytes;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 150);
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolveOnce({
        ok: false,
        stdout,
        stderr,
        timed_out: timedOut,
        exit_code: null,
        error: error.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolveOnce({
        ok: code === 0 && !timedOut,
        stdout,
        stderr,
        timed_out: timedOut,
        exit_code: code,
      });
    });
  });
}

export function parserRuntimeInstallPlan(parserIds: ParserId[]): {
  parser_ids: ParserId[];
  packages: string[];
  command: string;
  args: string[];
} {
  const parserIdsUnique = [
    ...new Set(parserIds.map((item) => normalizeParserId(item)).filter(Boolean)),
  ] as ParserId[];
  const packages = parserIdsUnique
    .map((parserId) => parserInstallableRuntimePackage(parserId))
    .filter((value): value is string => Boolean(value));
  return {
    parser_ids: parserIdsUnique,
    packages,
    command: "npm",
    args: [
      "install",
      "--no-save",
      "--no-package-lock",
      "--ignore-scripts",
      "--no-fund",
      "--no-audit",
      ...packages,
    ],
  };
}

export async function installParserRuntimes(
  workspace: string,
  parserIds: ParserId[],
  stateRoot?: string,
  timeoutMs = DEFAULT_INSTALL_TIMEOUT_MS,
): Promise<{
  ok: boolean;
  parser_ids: ParserId[];
  packages: string[];
  command: string;
  args: string[];
  timed_out: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  enabled: ParserId[];
  installed: ParserId[];
}> {
  const plan = parserRuntimeInstallPlan(parserIds);
  if (plan.packages.length === 0) {
    const parserConfig = await installParsers(workspace, plan.parser_ids, stateRoot);
    return {
      ok: true,
      parser_ids: plan.parser_ids,
      packages: [],
      command: plan.command,
      args: plan.args,
      timed_out: false,
      exit_code: 0,
      stdout: "No runtime packages required",
      stderr: "",
      enabled: parserConfig.enabled,
      installed: parserConfig.installed,
    };
  }

  const installResult = await runCommand(plan.command, plan.args, workspace, timeoutMs);
  if (!installResult.ok) {
    const parserConfig = await getParserConfig(workspace, stateRoot);
    return {
      ok: false,
      parser_ids: plan.parser_ids,
      packages: plan.packages,
      command: plan.command,
      args: plan.args,
      timed_out: installResult.timed_out,
      exit_code: installResult.exit_code,
      stdout: installResult.stdout,
      stderr: installResult.stderr,
      error: installResult.error,
      enabled: parserConfig.enabled,
      installed: parserConfig.installed,
    };
  }

  const parserConfig = await installParsers(workspace, plan.parser_ids, stateRoot);
  return {
    ok: true,
    parser_ids: plan.parser_ids,
    packages: plan.packages,
    command: plan.command,
    args: plan.args,
    timed_out: installResult.timed_out,
    exit_code: installResult.exit_code,
    stdout: installResult.stdout,
    stderr: installResult.stderr,
    enabled: parserConfig.enabled,
    installed: parserConfig.installed,
  };
}
