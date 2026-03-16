import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { resolveIndexDir } from "./state-root";
import type { ChunkRecord, FileRecord, Manifest, SymbolRecord } from "./types";

type SqlJsStatement = {
  bind: (params?: unknown[] | Record<string, unknown>) => void;
  step: () => boolean;
  getAsObject: () => Record<string, unknown>;
  free: () => void;
};

type SqlJsDatabase = {
  run: (sql: string, params?: unknown[] | Record<string, unknown>) => void;
  prepare: (sql: string) => SqlJsStatement;
  exec: (
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ) => {
    columns: string[];
    values: unknown[][];
  }[];
  export: () => Uint8Array;
};

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

const require = createRequire(import.meta.url);
const DB_FILENAME = "index.sqlite";

const SQL_JS_MODULE_PROMISE: Promise<SqlJsModule> = (async () => {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const sqlJsModule = (await import("sql.js")) as {
    default: (options: { locateFile: (file: string) => string }) => Promise<SqlJsModule>;
  };
  const initSqlJs = sqlJsModule.default;
  return initSqlJs({ locateFile: () => wasmPath });
})();

const DB_CACHE = new Map<string, { db: SqlJsDatabase; mtimeMs: number | null }>();

function dbPath(workspace: string, stateRoot?: string): string {
  return `${resolveIndexDir(workspace, stateRoot)}/${DB_FILENAME}`;
}

async function fileMtime(path: string): Promise<number | null> {
  try {
    const st = await stat(path);
    return st.mtimeMs;
  } catch {
    return null;
  }
}

function rowsFromExec<T>(
  execRows: {
    columns: string[];
    values: unknown[][];
  }[],
): T[] {
  if (execRows.length === 0) return [];
  const first = execRows[0] as { columns: string[]; values: unknown[][] };
  const out: T[] = [];
  for (const valueRow of first.values) {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < first.columns.length; i++) {
      const column = first.columns[i];
      if (!column) continue;
      row[column] = valueRow[i];
    }
    out.push(row as T);
  }
  return out;
}

function ensureSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      language TEXT NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL,
      top_level TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symbols (
      path TEXT NOT NULL,
      line INTEGER NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      signature_hint TEXT
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_top_level ON files(top_level);
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(path);
    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
  `);
}

async function persist(db: SqlJsDatabase, path: string): Promise<void> {
  const encoded = db.export();
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await writeFile(path, Buffer.from(encoded));
  const mtimeMs = await fileMtime(path);
  DB_CACHE.set(path, { db, mtimeMs });
}

async function loadDb(path: string): Promise<SqlJsDatabase> {
  const currentMtime = await fileMtime(path);
  const cached = DB_CACHE.get(path);
  if (cached?.mtimeMs === currentMtime) {
    return cached.db;
  }

  const sql = await SQL_JS_MODULE_PROMISE;
  let db: SqlJsDatabase;
  if (existsSync(path)) {
    try {
      db = new sql.Database(new Uint8Array(await readFile(path)));
    } catch {
      db = new sql.Database();
    }
  } else {
    db = new sql.Database();
  }
  try {
    ensureSchema(db);
  } catch {
    db = new sql.Database();
    ensureSchema(db);
  }
  DB_CACHE.set(path, { db, mtimeMs: currentMtime });
  return db;
}

export function indexDbExists(workspace: string, stateRoot?: string): boolean {
  return existsSync(dbPath(workspace, stateRoot));
}

export async function getAllFilePaths(workspace: string, stateRoot?: string): Promise<string[]> {
  const path = dbPath(workspace, stateRoot);
  if (!existsSync(path)) return [];
  const db = await loadDb(path);
  const rows = rowsFromExec<{ path: string }>(db.exec("SELECT path FROM files ORDER BY path ASC"));
  return rows.map((row) => row.path);
}

export async function replaceAllRecords(
  workspace: string,
  records: { files: FileRecord[]; symbols: SymbolRecord[]; chunks: ChunkRecord[] },
  stateRoot?: string,
): Promise<void> {
  const path = dbPath(workspace, stateRoot);
  const db = await loadDb(path);

  db.run("BEGIN TRANSACTION");
  db.run("DELETE FROM files");
  db.run("DELETE FROM symbols");
  db.run("DELETE FROM chunks");

  for (const file of records.files) {
    db.run("INSERT INTO files(path, language, size, hash, top_level) VALUES (?, ?, ?, ?, ?)", [
      file.path,
      file.language,
      file.size,
      file.hash,
      file.top_level,
    ]);
  }
  for (const symbol of records.symbols) {
    db.run("INSERT INTO symbols(path, line, kind, name, signature_hint) VALUES (?, ?, ?, ?, ?)", [
      symbol.path,
      symbol.line,
      symbol.kind,
      symbol.name,
      symbol.signature_hint ?? null,
    ]);
  }
  for (const chunk of records.chunks) {
    db.run("INSERT INTO chunks(id, path, start_line, end_line, content) VALUES (?, ?, ?, ?, ?)", [
      chunk.id,
      chunk.path,
      chunk.start_line,
      chunk.end_line,
      chunk.content,
    ]);
  }
  db.run("COMMIT");
  await persist(db, path);
}

export async function applyChangedRecords(
  workspace: string,
  changedPaths: Set<string>,
  records: { files: FileRecord[]; symbols: SymbolRecord[]; chunks: ChunkRecord[] },
  stateRoot?: string,
): Promise<void> {
  const path = dbPath(workspace, stateRoot);
  const db = await loadDb(path);

  db.run("BEGIN TRANSACTION");
  for (const rel of changedPaths) {
    db.run("DELETE FROM files WHERE path = ?", [rel]);
    db.run("DELETE FROM symbols WHERE path = ?", [rel]);
    db.run("DELETE FROM chunks WHERE path = ?", [rel]);
  }

  for (const file of records.files) {
    db.run("INSERT INTO files(path, language, size, hash, top_level) VALUES (?, ?, ?, ?, ?)", [
      file.path,
      file.language,
      file.size,
      file.hash,
      file.top_level,
    ]);
  }
  for (const symbol of records.symbols) {
    db.run("INSERT INTO symbols(path, line, kind, name, signature_hint) VALUES (?, ?, ?, ?, ?)", [
      symbol.path,
      symbol.line,
      symbol.kind,
      symbol.name,
      symbol.signature_hint ?? null,
    ]);
  }
  for (const chunk of records.chunks) {
    db.run("INSERT INTO chunks(id, path, start_line, end_line, content) VALUES (?, ?, ?, ?, ?)", [
      chunk.id,
      chunk.path,
      chunk.start_line,
      chunk.end_line,
      chunk.content,
    ]);
  }
  db.run("COMMIT");
  await persist(db, path);
}

export async function readAllRecords(
  workspace: string,
  stateRoot?: string,
): Promise<{ files: FileRecord[]; symbols: SymbolRecord[]; chunks: ChunkRecord[] }> {
  const path = dbPath(workspace, stateRoot);
  if (!existsSync(path)) {
    return { files: [], symbols: [], chunks: [] };
  }
  const db = await loadDb(path);

  const files = rowsFromExec<FileRecord>(
    db.exec("SELECT path, language, size, hash, top_level FROM files ORDER BY path ASC"),
  );
  const symbols = rowsFromExec<SymbolRecord>(
    db.exec(
      "SELECT path, line, kind, name, signature_hint FROM symbols ORDER BY path ASC, line ASC, name ASC",
    ),
  );
  const chunks = rowsFromExec<ChunkRecord>(
    db.exec(
      "SELECT id, path, start_line, end_line, content FROM chunks ORDER BY path ASC, start_line ASC",
    ),
  );
  return { files, symbols, chunks };
}

export async function readCounts(
  workspace: string,
  stateRoot?: string,
): Promise<{ file_count: number; symbol_count: number; chunk_count: number }> {
  const path = dbPath(workspace, stateRoot);
  if (!existsSync(path)) {
    return { file_count: 0, symbol_count: 0, chunk_count: 0 };
  }
  const db = await loadDb(path);

  const fileCountRows = rowsFromExec<{ c: number }>(db.exec("SELECT COUNT(*) AS c FROM files"));
  const symbolCountRows = rowsFromExec<{ c: number }>(db.exec("SELECT COUNT(*) AS c FROM symbols"));
  const chunkCountRows = rowsFromExec<{ c: number }>(db.exec("SELECT COUNT(*) AS c FROM chunks"));

  return {
    file_count: fileCountRows.length > 0 ? fileCountRows[0].c : 0,
    symbol_count: symbolCountRows.length > 0 ? symbolCountRows[0].c : 0,
    chunk_count: chunkCountRows.length > 0 ? chunkCountRows[0].c : 0,
  };
}

export function indexDbPath(workspace: string, stateRoot?: string): string {
  return dbPath(workspace, stateRoot);
}

export function countsToManifest(
  workspace: string,
  gitHead: string | null,
  counts: { file_count: number; symbol_count: number; chunk_count: number },
): Manifest {
  return {
    schema_version: "2",
    workspace,
    git_head: gitHead,
    generated_at: new Date().toISOString(),
    stale_after_hours: 24,
    file_count: counts.file_count,
    symbol_count: counts.symbol_count,
    chunk_count: counts.chunk_count,
  };
}
