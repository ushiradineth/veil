export type BuildMode = "full" | "changed";

export type Manifest = {
  schema_version: string;
  workspace: string;
  git_head: string | null;
  generated_at: string;
  stale_after_hours: number;
  file_count: number;
  symbol_count: number;
  chunk_count: number;
};

export type FileRecord = {
  path: string;
  language: string;
  size: number;
  hash: string;
  top_level: string;
};

export type SymbolRecord = {
  path: string;
  line: number;
  kind: string;
  name: string;
  signature_hint?: string;
};

export type ChunkRecord = {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  content: string;
};

export type QueryIntent = "auto" | "code" | "docs" | "symbols";
export type ResolvedQueryIntent = Exclude<QueryIntent, "auto">;

export type LookupConfidence = "high" | "medium" | "low";

export type LookupReason = {
  label: string;
  detail: string;
};

export type LookupResult<T> = {
  item: T;
  score: number;
  confidence: LookupConfidence;
  reasons: LookupReason[];
};

export type LookupFallback = {
  used: boolean;
  stage: "none" | "symbols" | "chunks" | "files" | "all";
  detail: string;
};

export type LookupResponse = {
  intent: ResolvedQueryIntent;
  files: LookupResult<FileRecord>[];
  symbols: LookupResult<SymbolRecord>[];
  chunks: LookupResult<ChunkRecord>[];
  fallback: LookupFallback;
};

export type IndexStatus = {
  exists: boolean;
  stale: boolean;
  reasons: string[];
  manifest: Manifest | null;
  current_git_head: string | null;
};

export type GitToolName = "git_status" | "git_diff" | "git_log" | "git_show" | "gh_lookup";

export type GitToolErrorCode =
  | "not-a-repo"
  | "git-unavailable"
  | "gh-unavailable"
  | "gh-unauthenticated"
  | "invalid-revision"
  | "invalid-path"
  | "unsafe-arg"
  | "timeout"
  | "output-too-large"
  | "command-failed";

export type GitToolError = {
  code: GitToolErrorCode;
  message: string;
};

export type GitToolMeta = {
  ok: boolean;
  workspace: string;
  tool: GitToolName;
  git_available: boolean;
  duration_ms: number;
  truncated: boolean;
  warnings: string[];
};

export type GitToolResponse<T> = {
  meta: GitToolMeta;
  data: T | null;
  error: GitToolError | null;
};

export type GitStatusData = {
  branch: string;
  head: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  changed: {
    staged: number;
    unstaged: number;
    untracked: number;
  };
  paths: {
    staged: string[];
    unstaged: string[];
    untracked: string[];
  };
};

export type GitLogEntry = {
  commit: string;
  author: string;
  date: string;
  subject: string;
  parents: string[];
};

export type GitLogData = {
  limit: number;
  entries: GitLogEntry[];
};

export type GitDiffData = {
  mode: "working" | "range";
  staged: boolean;
  name_only: boolean;
  base: string | null;
  head: string | null;
  path: string | null;
  text: string;
};

export type GitShowData = {
  rev: string;
  path: string | null;
  patch: boolean;
  text: string;
};

export type GhLookupKind = "repo_context" | "issues" | "prs" | "checks";

export type GhLookupData = {
  repo: string;
  kind: GhLookupKind;
  query: string;
  limit: number;
  text: string;
  repo_url?: string;
  cloned_workspace?: string;
  state_root?: string;
  status_exists?: boolean;
};

export type WebSearchProvider =
  | "google"
  | "duckduckgo"
  | "wikipedia"
  | "github"
  | "reddit"
  | "deepwiki";

export type WebSearchProviderTrace = {
  provider: WebSearchProvider;
  ok: boolean;
  duration_ms: number;
  result_count: number;
  warning: string | null;
};

export type WebSearchResult = {
  title: string;
  url: string;
};

export type WebSearchDebugResult = {
  title: string;
  url: string;
  snippet: string;
  score: number;
  reasons: LookupReason[];
};

export type WebSearchData = {
  results: WebSearchResult[];
  debug?: {
    query: string;
    provider: WebSearchProvider;
    warnings: string[];
    provider_trace: WebSearchProviderTrace[];
    detailed_results: WebSearchDebugResult[];
  };
};

export type WebSearchErrorCode =
  | "invalid-query"
  | "provider-unavailable"
  | "timeout"
  | "internal-error";

export type WebSearchError = {
  code: WebSearchErrorCode;
  message: string;
};

export type WebSearchMeta = {
  ok: boolean;
  duration_ms: number;
};

export type WebSearchResponse = {
  meta: WebSearchMeta;
  data: WebSearchData | null;
  error: WebSearchError | null;
};

export type FetchUrlFormat = "markdown" | "text" | "html";

export type FetchUrlErrorCode = "invalid-url" | "timeout" | "fetch-failed" | "internal-error";

export type FetchUrlError = {
  code: FetchUrlErrorCode;
  message: string;
};

export type FetchUrlMeta = {
  ok: boolean;
  duration_ms: number;
  truncated: boolean;
};

export type FetchUrlData = {
  url: string;
  final_url: string;
  status: number;
  content_type: string;
  format: FetchUrlFormat;
  markdown_tokens: number | null;
  content_signal: string | null;
  vary: string | null;
  content: string;
};

export type FetchUrlResponse = {
  meta: FetchUrlMeta;
  data: FetchUrlData | null;
  error: FetchUrlError | null;
};
