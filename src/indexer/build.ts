import type { ChunkRecord, FileRecord, SymbolRecord } from "../types";

export function mergeIncrementalRecords(
  prevFiles: FileRecord[],
  prevSymbols: SymbolRecord[],
  prevChunks: ChunkRecord[],
  changedSet: Set<string>,
  recomputed: { files: FileRecord[]; symbols: SymbolRecord[]; chunks: ChunkRecord[] },
): { files: FileRecord[]; symbols: SymbolRecord[]; chunks: ChunkRecord[] } {
  const keptFiles = prevFiles.filter((f) => !changedSet.has(f.path));
  const keptSymbols = prevSymbols.filter((s) => !changedSet.has(s.path));
  const keptChunks = prevChunks.filter((c) => !changedSet.has(c.path));

  return {
    files: [...keptFiles, ...recomputed.files],
    symbols: [...keptSymbols, ...recomputed.symbols],
    chunks: [...keptChunks, ...recomputed.chunks],
  };
}

export function sortIndexedRecords(records: {
  files: FileRecord[];
  symbols: SymbolRecord[];
  chunks: ChunkRecord[];
}): void {
  records.files.sort((a, b) => a.path.localeCompare(b.path));
  records.symbols.sort((a, b) =>
    a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path),
  );
  records.chunks.sort((a, b) => a.id.localeCompare(b.id));
}
