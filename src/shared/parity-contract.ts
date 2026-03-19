import { clampInt } from "../validation";

export const PARITY_LIMITS = {
  files_limit: { min: 1, max: 200, default: 20 },
  symbols_limit: { min: 1, max: 200, default: 20 },
  search_limit: { min: 1, max: 100, default: 10 },
  lookup_files_limit: { min: 1, max: 200, default: 8 },
  lookup_symbols_limit: { min: 1, max: 200, default: 12 },
  lookup_search_limit: { min: 1, max: 100, default: 8 },
  chunk_content_max_chars: { min: 40, max: 20000, default: 240 },
  web_search_limit: { min: 1, max: 25, default: 8 },
  web_search_timeout_ms: { min: 100, max: 20000, default: 5000 },
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function responseErrorMessage(value: unknown): string | null {
  const payload = asRecord(value);
  const meta = asRecord(payload.meta);
  if (meta.ok === false) {
    const error = asRecord(payload.error);
    const message = asString(error.message);
    return message?.trim() ? message : "Tool execution failed";
  }
  if (payload.ok === false) {
    const error = asRecord(payload.error);
    const message = asString(error.message);
    return message?.trim() ? message : "Tool execution failed";
  }
  return null;
}

export function clampChunkContentChars(value: number | undefined): number {
  return clampInt(
    value,
    PARITY_LIMITS.chunk_content_max_chars.min,
    PARITY_LIMITS.chunk_content_max_chars.max,
    PARITY_LIMITS.chunk_content_max_chars.default,
  );
}

export function normalizeOptionalChunkContentChars(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return clampChunkContentChars(value);
}

export function clampWebSearchLimit(value: number | undefined): number {
  return clampInt(
    value,
    PARITY_LIMITS.web_search_limit.min,
    PARITY_LIMITS.web_search_limit.max,
    PARITY_LIMITS.web_search_limit.default,
  );
}

export function clampWebSearchTimeout(value: number | undefined): number {
  return clampInt(
    value,
    PARITY_LIMITS.web_search_timeout_ms.min,
    PARITY_LIMITS.web_search_timeout_ms.max,
    PARITY_LIMITS.web_search_timeout_ms.default,
  );
}

export function clampFilesLimit(value: number | undefined): number {
  return clampInt(
    value,
    PARITY_LIMITS.files_limit.min,
    PARITY_LIMITS.files_limit.max,
    PARITY_LIMITS.files_limit.default,
  );
}

export function clampSymbolsLimit(value: number | undefined): number {
  return clampInt(
    value,
    PARITY_LIMITS.symbols_limit.min,
    PARITY_LIMITS.symbols_limit.max,
    PARITY_LIMITS.symbols_limit.default,
  );
}

export function clampSearchLimit(value: number | undefined): number {
  return clampInt(
    value,
    PARITY_LIMITS.search_limit.min,
    PARITY_LIMITS.search_limit.max,
    PARITY_LIMITS.search_limit.default,
  );
}

export function normalizeLookupFilesLimit(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clampInt(
    value,
    PARITY_LIMITS.lookup_files_limit.min,
    PARITY_LIMITS.lookup_files_limit.max,
    PARITY_LIMITS.lookup_files_limit.default,
  );
}

export function normalizeLookupSymbolsLimit(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clampInt(
    value,
    PARITY_LIMITS.lookup_symbols_limit.min,
    PARITY_LIMITS.lookup_symbols_limit.max,
    PARITY_LIMITS.lookup_symbols_limit.default,
  );
}

export function normalizeLookupSearchLimit(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clampInt(
    value,
    PARITY_LIMITS.lookup_search_limit.min,
    PARITY_LIMITS.lookup_search_limit.max,
    PARITY_LIMITS.lookup_search_limit.default,
  );
}
