import { isAbsolute, join, normalize, relative } from "node:path";

export const DEFAULT_STATE_ROOT = ".veil";

export function resolveStateRoot(workspace: string, override?: string): string {
  const raw = (override ?? process.env.VEIL_STATE_ROOT ?? DEFAULT_STATE_ROOT).trim();
  if (!raw) return join(workspace, DEFAULT_STATE_ROOT);
  if (isAbsolute(raw)) return normalize(raw);
  return normalize(join(workspace, raw));
}

export function resolveIndexDir(workspace: string, override?: string): string {
  return join(resolveStateRoot(workspace, override), "index");
}

export function relativeStateRoot(workspace: string, override?: string): string | null {
  const stateRoot = resolveStateRoot(workspace, override);
  const rel = relative(workspace, stateRoot);
  if (!rel || rel === ".") return "";
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}

export function diagnosticsStatePath(workspace: string, override?: string): string {
  return join(resolveIndexDir(workspace, override), "diagnostics-state.json");
}
