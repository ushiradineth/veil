import type { AgentGuidance } from "./types";

export type GuidanceTool =
  | "status"
  | "refresh"
  | "files"
  | "symbols"
  | "search"
  | "find_file"
  | "find_symbol"
  | "search_for_pattern"
  | "lookup"
  | "discover"
  | "web_search"
  | "fetch_url"
  | "git_status"
  | "git_log"
  | "git_diff"
  | "git_show"
  | "gh_lookup"
  | "diagnostics";

type GuidanceOptions = {
  query?: string;
};

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as RecordLike;
  }
  return { value };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isOk(payload: RecordLike): boolean {
  const meta = asRecord(payload.meta);
  if (typeof meta.ok === "boolean") return meta.ok;
  return true;
}

function countResults(payload: RecordLike): number {
  const items = asArray(payload.items).length;
  const files = asArray(payload.files).length;
  const symbols = asArray(payload.symbols).length;
  const chunks = asArray(payload.chunks).length;
  const data = asRecord(payload.data);
  const web = asArray(data.results).length;
  const gitEntries = asArray(data.entries).length;
  if (items + files + symbols + chunks + web + gitEntries > 0) {
    return items + files + symbols + chunks + web + gitEntries;
  }
  if (typeof data.text === "string" && data.text.trim().length > 0) return 1;
  const content = data.content;
  if (typeof content === "string" && content.length > 0) return 1;
  return 0;
}

function nextCalls(tool: GuidanceTool): string[] {
  switch (tool) {
    case "discover":
      return ["lookup", "search", "symbols"];
    case "lookup":
      return ["discover", "search", "symbols"];
    case "files":
    case "find_file":
      return ["search", "lookup", "symbols"];
    case "symbols":
    case "find_symbol":
      return ["lookup", "search", "files"];
    case "search":
    case "search_for_pattern":
      return ["lookup", "files", "symbols"];
    case "web_search":
      return ["fetch_url", "discover", "lookup"];
    case "fetch_url":
      return ["web_search", "discover", "lookup"];
    case "git_status":
      return ["git_diff", "git_log", "discover"];
    case "git_log":
      return ["git_show", "git_diff", "discover"];
    case "git_diff":
      return ["git_show", "git_status", "discover"];
    case "git_show":
      return ["git_log", "git_diff", "discover"];
    case "gh_lookup":
      return ["discover", "lookup", "git_log"];
    case "status":
      return ["discover", "lookup", "files"];
    case "refresh":
      return ["discover", "lookup", "search"];
    case "diagnostics":
      return ["status", "discover", "lookup"];
    default:
      return ["discover", "lookup", "search"];
  }
}

function defaultMissingContext(tool: GuidanceTool): string[] {
  switch (tool) {
    case "web_search":
      return ["No web hits in current provider window"];
    case "fetch_url":
      return ["No content extracted from current URL response"];
    case "git_status":
    case "git_log":
    case "git_diff":
    case "git_show":
    case "gh_lookup":
      return ["Repository context call returned no actionable payload"];
    default:
      return ["No indexed matches for current query"];
  }
}

function hasStructuralPayload(tool: GuidanceTool, payload: RecordLike): boolean {
  if (tool === "git_status") {
    const data = asRecord(payload.data);
    const branch = data.branch;
    return typeof branch === "string" && branch.length > 0;
  }
  if (tool === "status") {
    return typeof payload.exists === "boolean";
  }
  if (tool === "refresh") {
    return typeof payload.ok === "boolean";
  }
  if (tool === "diagnostics") {
    return payload.cache !== undefined || payload.operations !== undefined;
  }
  return false;
}

function recommendQuery(query: string | undefined): string | undefined {
  if (!query || query.trim().length === 0) return undefined;
  const normalized = query.trim().replace(/\s+/g, " ");
  return `broaden: ${normalized}`;
}

export function buildAgentGuidance(
  tool: GuidanceTool,
  payloadValue: unknown,
  options?: GuidanceOptions,
): AgentGuidance {
  const payload = asRecord(payloadValue);
  const ok = isOk(payload);
  const resultCount = countResults(payload);

  if (!ok) {
    return {
      next_calls: nextCalls(tool),
      confidence: "low",
      coverage: "none",
      missing_context: defaultMissingContext(tool),
      recommended_query: recommendQuery(options?.query),
    };
  }

  if (resultCount === 0) {
    if (hasStructuralPayload(tool, payload)) {
      return {
        next_calls: nextCalls(tool),
        confidence: "high",
        coverage: "full",
      };
    }
    return {
      next_calls: nextCalls(tool),
      confidence: "medium",
      coverage: "partial",
      missing_context: defaultMissingContext(tool),
      recommended_query: recommendQuery(options?.query),
    };
  }

  return {
    next_calls: nextCalls(tool),
    confidence: "high",
    coverage: "full",
  };
}

export function withAgentGuidance(
  tool: GuidanceTool,
  payloadValue: unknown,
  options?: GuidanceOptions,
): RecordLike {
  const payload = asRecord(payloadValue);
  return {
    ...payload,
    guidance: buildAgentGuidance(tool, payload, options),
  };
}
