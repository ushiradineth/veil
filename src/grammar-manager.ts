import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { resolveStateRoot } from "./state-root";

export type ParserId = "javascript" | "typescript" | "python" | "json" | "bash" | "go" | "rust";

export type ParserCatalogEntry = {
  id: ParserId;
  aliases: string[];
  label: string;
  default_enabled: boolean;
};

type ParserState = {
  version: 1;
  enabled: ParserId[];
  installed: ParserId[];
};

const PARSER_STATE_FILE = "grammars.json";

export const BUILTIN_PARSERS: ParserCatalogEntry[] = [
  { id: "javascript", aliases: ["js", "javascript"], label: "JavaScript", default_enabled: true },
  { id: "typescript", aliases: ["ts", "typescript"], label: "TypeScript", default_enabled: true },
  { id: "python", aliases: ["py", "python"], label: "Python", default_enabled: true },
  { id: "json", aliases: ["json"], label: "JSON", default_enabled: true },
  { id: "bash", aliases: ["bash", "sh", "shell"], label: "Bash", default_enabled: true },
  { id: "go", aliases: ["go", "golang"], label: "Go", default_enabled: true },
  { id: "rust", aliases: ["rust", "rs"], label: "Rust", default_enabled: true },
];

const ID_SET = new Set(BUILTIN_PARSERS.map((entry) => entry.id));

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
  const raw = value as { enabled?: unknown; installed?: unknown; version?: unknown };
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
  const nextEnabled = [...new Set(enabled)].filter((item) => ID_SET.has(item));
  const nextInstalled = [...new Set([...state.installed, ...nextEnabled])].filter((item) =>
    ID_SET.has(item),
  );
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
  const add = parserIds.filter((item) => ID_SET.has(item));
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
): Promise<{ enabled: ParserId[]; installed: ParserId[]; updated: ParserId[] }> {
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
