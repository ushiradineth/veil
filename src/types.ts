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

export type IndexStatus = {
  exists: boolean;
  stale: boolean;
  reasons: string[];
  manifest: Manifest | null;
  current_git_head: string | null;
};
