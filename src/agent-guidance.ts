import type { AgentGuidance } from "./types";

export type GuidanceTool =
  | "status"
  | "refresh"
  | "files"
  | "symbols"
  | "search"
  | "lookup"
  | "discover"
  | "chunk"
  | "web_search"
  | "fetch_url"
  | "git_status"
  | "git_log"
  | "git_diff"
  | "git_show"
  | "gh_lookup"
  | "diagnostics"
  | "grammar_recommend"
  | "grammar_runtime_install";

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
      return ["lookup", "search"];
    case "chunk":
      return ["lookup", "search"];
    case "lookup":
      return ["discover", "search"];
    case "files":
      return ["search", "lookup"];
    case "symbols":
      return ["lookup", "search"];
    case "search":
      return ["lookup", "files"];
    case "web_search":
      return ["fetch_url", "discover"];
    case "fetch_url":
      return ["web_search", "discover"];
    case "git_status":
      return ["git_diff", "git_log"];
    case "git_log":
      return ["git_show", "git_diff"];
    case "git_diff":
      return ["git_show", "git_status"];
    case "git_show":
      return ["git_log", "git_diff"];
    case "gh_lookup":
      return ["discover", "lookup"];
    case "status":
      return ["discover", "lookup"];
    case "refresh":
      return ["discover", "lookup"];
    case "diagnostics":
      return ["status", "discover"];
    case "grammar_recommend":
      return ["grammar_runtime_install", "grammar_install"];
    case "grammar_runtime_install":
      return ["refresh", "discover"];
    default:
      return ["discover", "lookup"];
  }
}

function defaultMissingContext(tool: GuidanceTool): string[] {
  switch (tool) {
    case "web_search":
      return ["No web hits"];
    case "fetch_url":
      return ["No URL content"];
    case "git_status":
    case "git_log":
    case "git_diff":
    case "git_show":
    case "gh_lookup":
      return ["No git/github context"];
    default:
      return ["No indexed matches"];
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
  return `broaden ${normalized}`;
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

export function withAgentGuidanceCompact(
  tool: GuidanceTool,
  payloadValue: unknown,
  options?: GuidanceOptions,
): RecordLike {
  const payload = asRecord(payloadValue);
  const guidance = buildAgentGuidance(tool, payload, options);
  const include = guidance.confidence !== "high" || guidance.coverage !== "full";
  if (!include) {
    return payload;
  }
  return {
    ...payload,
    guidance,
  };
}
