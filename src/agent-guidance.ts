import type { AgentGuidance } from "./types";

export type GuidanceTool =
  | "status"
  | "update_check"
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

function grammarRecommendNextCalls(payload: RecordLike | undefined): string[] {
  const suggestions = asArray(payload?.suggestions);
  let hasParserDisabled = false;
  let hasRuntimeMissing = false;
  for (const suggestion of suggestions) {
    const reason = asRecord(suggestion).reason;
    if (reason === "parser-disabled") hasParserDisabled = true;
    if (reason === "runtime-missing") hasRuntimeMissing = true;
  }
  if (hasParserDisabled && hasRuntimeMissing) {
    return ["grammar_install", "grammar_runtime_install"];
  }
  if (hasParserDisabled) return ["grammar_install"];
  if (hasRuntimeMissing) return ["grammar_runtime_install"];
  return ["grammar_runtime_install", "grammar_install"];
}

function nextCalls(tool: GuidanceTool, payload?: RecordLike): string[] {
  switch (tool) {
    case "discover":
      return ["lookup"];
    case "chunk":
      return ["lookup"];
    case "lookup":
      return ["search"];
    case "files":
      return ["lookup"];
    case "symbols":
      return ["lookup"];
    case "search":
      return ["lookup"];
    case "web_search":
      return ["fetch_url"];
    case "fetch_url":
      return ["web_search"];
    case "git_status":
      return ["git_diff"];
    case "git_log":
      return ["git_show"];
    case "git_diff":
      return ["git_show"];
    case "git_show":
      return ["git_log"];
    case "gh_lookup":
      return ["lookup"];
    case "status":
      return ["lookup"];
    case "update_check":
      return ["status"];
    case "refresh":
      return ["lookup"];
    case "diagnostics":
      return ["status"];
    case "grammar_recommend":
      return grammarRecommendNextCalls(payload);
    case "grammar_runtime_install":
      return ["refresh"];
    default:
      return ["lookup"];
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
  if (tool === "git_log") {
    const data = asRecord(payload.data);
    return Array.isArray(data.entries) && typeof data.limit === "number";
  }
  if (tool === "git_diff") {
    const data = asRecord(payload.data);
    return (
      typeof data.mode === "string" &&
      typeof data.staged === "boolean" &&
      typeof data.name_only === "boolean" &&
      typeof data.text === "string"
    );
  }
  if (tool === "git_show") {
    const data = asRecord(payload.data);
    return (
      typeof data.rev === "string" &&
      typeof data.patch === "boolean" &&
      typeof data.text === "string"
    );
  }
  if (tool === "status") {
    return typeof payload.exists === "boolean";
  }
  if (tool === "update_check") {
    const mcp = asRecord(payload.mcp);
    return typeof mcp.current === "string";
  }
  if (tool === "refresh") {
    return typeof payload.ok === "boolean";
  }
  if (tool === "diagnostics") {
    return payload.cache !== undefined || payload.operations !== undefined;
  }
  return false;
}

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "by",
  "for",
  "from",
  "help",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "need",
  "of",
  "on",
  "or",
  "please",
  "show",
  "that",
  "the",
  "this",
  "to",
  "use",
  "what",
  "where",
  "with",
]);

function isHighSignalToken(token: string): boolean {
  if (token.length <= 1) return false;
  if (/[._/:#@+-]/.test(token)) return true;
  if (/[A-Z]/.test(token)) return true;
  if (/\p{N}/u.test(token)) return true;
  return !QUERY_STOP_WORDS.has(token.toLowerCase());
}

function sanitizeToken(token: string): string {
  return token.replace(/^[^\p{L}\p{N}_./:#@+-]+|[^\p{L}\p{N}_./:#@+-]+$/gu, "");
}

function recommendQuery(query: string | undefined): string | undefined {
  if (!query || query.trim().length === 0) return undefined;
  const normalized = query.trim().replace(/\s+/g, " ");
  const tokens = normalized
    .split(" ")
    .map(sanitizeToken)
    .filter((token) => token.length > 0)
    .filter((token) => isHighSignalToken(token));
  if (tokens.length === 0) {
    const fallback = normalized
      .split(" ")
      .map(sanitizeToken)
      .filter((token) => token.length > 0)
      .slice(0, 6)
      .join(" ");
    return fallback.length > 0 ? fallback : undefined;
  }
  return tokens.slice(0, 8).join(" ");
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
      next_calls: nextCalls(tool, payload),
      confidence: "low",
      coverage: "none",
      missing_context: defaultMissingContext(tool),
      recommended_query: recommendQuery(options?.query),
    };
  }

  if (resultCount === 0) {
    if (hasStructuralPayload(tool, payload)) {
      return {
        next_calls: nextCalls(tool, payload),
        confidence: "high",
        coverage: "full",
      };
    }
    return {
      next_calls: nextCalls(tool, payload),
      confidence: "medium",
      coverage: "partial",
      missing_context: defaultMissingContext(tool),
      recommended_query: recommendQuery(options?.query),
    };
  }

  return {
    next_calls: nextCalls(tool, payload),
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
