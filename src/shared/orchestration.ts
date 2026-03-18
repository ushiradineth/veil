import type { QueryIntent } from "../types";

export function parseIntent(value: unknown): QueryIntent {
  return value === "code" || value === "docs" || value === "symbols" ? value : "auto";
}

export function compactStatusSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { exists: false, stale: true, reasons: ["unknown"] };
  }
  const record = value as Record<string, unknown>;
  return {
    exists: record.exists === true,
    stale: record.stale === true,
    reasons: Array.isArray(record.reasons) ? record.reasons : [],
  };
}
