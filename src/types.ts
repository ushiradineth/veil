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

export type GhLookupKind = "issues" | "prs" | "checks";

export type GhLookupData = {
  repo: string;
  kind: GhLookupKind;
  query: string;
  limit: number;
  text: string;
};
