import { copyFileSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

import type { ParserId } from "./grammar-manager";
import type { SymbolRecord } from "./types";

type RuntimeLanguageConfig = {
  loader: (runtimeRoots?: string[], allowGlobalFallback?: boolean) => unknown;
  parserId: ParserId;
  symbolKinds: Record<string, SymbolRecord["kind"]>;
};

const require = createRequire(import.meta.url);
const RUNTIME_REQUIRE_CACHE = new Map<string, NodeRequire>();

export type BunPrebuildRecovery = {
  attempted: boolean;
  ok: boolean;
  reason:
    | "not-bun"
    | "already-present"
    | "linked"
    | "copied"
    | "missing-candidate"
    | "readonly"
    | "resolution-failed";
};

let LAST_BUN_PREBUILD_RECOVERY: BunPrebuildRecovery = {
  attempted: false,
  ok: false,
  reason: "not-bun",
};

type BunPrebuildDeps = {
  isBun: boolean;
  platform: string;
  arch: string;
  resolvePackage: () => string;
  exists: (path: string) => boolean;
  mkdir: (path: string) => void;
  symlink: (target: string, path: string) => void;
  copy: (from: string, to: string) => void;
  relativePath: (from: string, to: string) => string;
};

function permissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}

function ensureBunTreeSitterPrebuildWith(deps: BunPrebuildDeps): BunPrebuildRecovery {
  if (!deps.isBun) {
    return { attempted: false, ok: false, reason: "not-bun" };
  }
  try {
    const pkg = deps.resolvePackage();
    const root = dirname(pkg);
    const expectedDir = join(root, "prebuilds", `${deps.platform}-${deps.arch}`);
    const expectedFile = join(expectedDir, "tree-sitter.node");
    if (deps.exists(expectedFile)) return { attempted: true, ok: true, reason: "already-present" };

    const candidate = join(root, "build", "Release", "tree_sitter_runtime_binding.node");
    if (!deps.exists(candidate)) return { attempted: true, ok: false, reason: "missing-candidate" };

    try {
      deps.mkdir(expectedDir);
    } catch (error) {
      if (permissionDenied(error)) return { attempted: true, ok: false, reason: "readonly" };
      throw error;
    }

    try {
      deps.symlink(deps.relativePath(expectedDir, candidate), expectedFile);
      return { attempted: true, ok: true, reason: "linked" };
    } catch {
      try {
        if (!deps.exists(expectedFile)) {
          deps.copy(candidate, expectedFile);
          return { attempted: true, ok: true, reason: "copied" };
        }
        return { attempted: true, ok: true, reason: "already-present" };
      } catch (error) {
        if (permissionDenied(error)) return { attempted: true, ok: false, reason: "readonly" };
        throw error;
      }
    }
  } catch {
    return { attempted: true, ok: false, reason: "resolution-failed" };
  }
}

function ensureBunTreeSitterPrebuild(): BunPrebuildRecovery {
  const status = ensureBunTreeSitterPrebuildWith({
    isBun: typeof process.versions.bun === "string",
    platform: process.platform,
    arch: process.arch,
    resolvePackage: () => require.resolve("tree-sitter/package.json"),
    exists: existsSync,
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    symlink: symlinkSync,
    copy: copyFileSync,
    relativePath: relative,
  });
  LAST_BUN_PREBUILD_RECOVERY = status;
  return status;
}

function loadParserClass(): ParserCtor | undefined {
  let parser = optionalModule("tree-sitter") as ParserCtor | undefined;
  if (parser) return parser;
  ensureBunTreeSitterPrebuild();
  parser = optionalModule("tree-sitter") as ParserCtor | undefined;
  return parser;
}

export function getBunPrebuildRecoveryStatus(): BunPrebuildRecovery {
  return LAST_BUN_PREBUILD_RECOVERY;
}

function optionalModule(
  name: string,
  runtimeRoots: string[] = [],
  allowGlobalFallback = true,
): unknown {
  for (const root of runtimeRoots) {
    let runtimeRequire = RUNTIME_REQUIRE_CACHE.get(root);
    if (!runtimeRequire) {
      runtimeRequire = createRequire(join(root, "__veil_runtime_loader__.cjs"));
      RUNTIME_REQUIRE_CACHE.set(root, runtimeRequire);
    }
    try {
      return runtimeRequire(name);
    } catch {
      continue;
    }
  }
  if (!allowGlobalFallback) return undefined;
  try {
    return require(name);
  } catch {
    return undefined;
  }
}

function typescriptLanguage(runtimeRoots: string[] = [], allowGlobalFallback = true): unknown {
  const mod = optionalModule("tree-sitter-typescript", runtimeRoots, allowGlobalFallback) as
    | { typescript?: unknown }
    | undefined;
  return mod?.typescript ?? null;
}

const RUNTIME_LANGUAGE_MAP: Partial<Record<string, RuntimeLanguageConfig>> = {
  javascript: {
    loader: (runtimeRoots, allowGlobalFallback) =>
      optionalModule("tree-sitter-javascript", runtimeRoots, allowGlobalFallback),
    parserId: "javascript",
    symbolKinds: {
      function_declaration: "function",
      class_declaration: "class",
      method_definition: "method",
    },
  },
  typescript: {
    loader: typescriptLanguage,
    parserId: "typescript",
    symbolKinds: {
      function_declaration: "function",
      class_declaration: "class",
      method_definition: "method",
      interface_declaration: "interface",
      type_alias_declaration: "type",
      enum_declaration: "type",
    },
  },
  python: {
    loader: (runtimeRoots, allowGlobalFallback) =>
      optionalModule("tree-sitter-python", runtimeRoots, allowGlobalFallback),
    parserId: "python",
    symbolKinds: {
      function_definition: "function",
      class_definition: "class",
    },
  },
  shell: {
    loader: (runtimeRoots, allowGlobalFallback) =>
      optionalModule("tree-sitter-bash", runtimeRoots, allowGlobalFallback),
    parserId: "bash",
    symbolKinds: {
      function_definition: "function",
    },
  },
  go: {
    loader: (runtimeRoots, allowGlobalFallback) =>
      optionalModule("tree-sitter-go", runtimeRoots, allowGlobalFallback),
    parserId: "go",
    symbolKinds: {
      function_declaration: "function",
      method_declaration: "method",
      type_declaration: "type",
    },
  },
  rust: {
    loader: (runtimeRoots, allowGlobalFallback) =>
      optionalModule("tree-sitter-rust", runtimeRoots, allowGlobalFallback),
    parserId: "rust",
    symbolKinds: {
      function_item: "function",
      struct_item: "type",
      enum_item: "type",
      trait_item: "interface",
      impl_item: "type",
    },
  },
};

type ParserRuntime = {
  setLanguage: (language: unknown) => void;
  parse: (content: string) => { rootNode: unknown };
};

type ParserCtor = new () => ParserRuntime;

const PARSER_CLASS = loadParserClass();

const PARSER_CACHE = new Map<string, ParserRuntime>();

type NodeLike = {
  type: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number };
  namedChildren: NodeLike[];
  childForFieldName: (name: string) => NodeLike | null;
};

function getParser(
  language: string,
  tsLanguage: unknown,
  runtimeKey: string,
): { parse: (content: string) => { rootNode: NodeLike } } | null {
  if (!PARSER_CLASS) return null;
  const cacheKey = `${language}\u0000${runtimeKey}`;
  const cached = PARSER_CACHE.get(cacheKey);
  if (cached) return cached as { parse: (content: string) => { rootNode: NodeLike } };
  const parser = new PARSER_CLASS();
  parser.setLanguage(tsLanguage);
  PARSER_CACHE.set(cacheKey, parser);
  return parser as { parse: (content: string) => { rootNode: NodeLike } };
}

function nodeText(content: string, node: NodeLike): string {
  return content.slice(node.startIndex, node.endIndex);
}

function detectNodeName(node: NodeLike, content: string): string | null {
  const directName = node.childForFieldName("name");
  if (directName) {
    const value = nodeText(content, directName).trim();
    if (value) return value;
  }
  for (const child of node.namedChildren) {
    if (
      child.type === "identifier" ||
      child.type === "property_identifier" ||
      child.type === "type_identifier" ||
      child.type === "field_identifier"
    ) {
      const value = nodeText(content, child).trim();
      if (value) return value;
    }
  }
  return null;
}

function maybeSignature(node: NodeLike, content: string): string | undefined {
  const params = node.childForFieldName("parameters");
  if (!params) return undefined;
  const value = nodeText(content, params).trim();
  return value || undefined;
}

function collectNodesByType(root: NodeLike, types: Set<string>): NodeLike[] {
  const out: NodeLike[] = [];
  const stack: NodeLike[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (types.has(node.type)) out.push(node);
    for (const child of node.namedChildren) stack.push(child);
  }
  return out;
}

function loadDynamicLanguageRuntime(
  language: string,
  runtimeRoots: string[] = [],
  allowGlobalFallback = true,
): unknown {
  if (!language || language === "text") return null;
  return optionalModule(`tree-sitter-${language}`, runtimeRoots, allowGlobalFallback);
}

function genericSymbolKind(nodeType: string): SymbolRecord["kind"] | null {
  if (nodeType.includes("function") || nodeType.includes("lambda")) return "function";
  if (nodeType.includes("method")) return "method";
  if (nodeType.includes("class")) return "class";
  if (nodeType.includes("interface") || nodeType.includes("trait")) return "interface";
  if (
    nodeType.includes("type") ||
    nodeType.includes("struct") ||
    nodeType.includes("enum") ||
    nodeType.includes("module")
  ) {
    return "type";
  }
  return null;
}

function extractGenericSymbols(
  path: string,
  language: string,
  content: string,
  runtimeLanguage: unknown,
  runtimeKey: string,
): SymbolRecord[] | null {
  const parser = getParser(language, runtimeLanguage, runtimeKey);
  if (!parser) return null;
  try {
    const tree = parser.parse(content);
    const stack: NodeLike[] = [tree.rootNode];
    const seen = new Set<string>();
    const out: SymbolRecord[] = [];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      const kind = genericSymbolKind(node.type);
      if (kind) {
        const name = detectNodeName(node, content);
        if (name) {
          const key = `${name}:${String(node.startPosition.row)}:${kind}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({
              path,
              line: node.startPosition.row + 1,
              kind,
              name,
              signature_hint: maybeSignature(node, content),
            });
          }
        }
      }
      for (const child of node.namedChildren) {
        stack.push(child);
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function extractSymbolsWithTreeSitter(
  path: string,
  language: string,
  content: string,
  enabledParsers: Set<ParserId>,
  runtimeRoots: string[] = [],
  globalFallbackAllowedParsers: Set<ParserId> = new Set<ParserId>(),
): SymbolRecord[] | null {
  const runtimeKeyBase = runtimeRoots.join("\u0000");
  if (language === "json") {
    return enabledParsers.has("json") ? [] : null;
  }
  const config = RUNTIME_LANGUAGE_MAP[language];
  if (!config) {
    if (!enabledParsers.has(language)) return null;
    const allowGlobalFallback = globalFallbackAllowedParsers.has(language);
    const runtimeKey = `${runtimeKeyBase}\u0000${allowGlobalFallback ? "1" : "0"}`;
    const dynamicRuntime = loadDynamicLanguageRuntime(language, runtimeRoots, allowGlobalFallback);
    if (!dynamicRuntime) return null;
    return extractGenericSymbols(path, language, content, dynamicRuntime, runtimeKey);
  }
  if (!enabledParsers.has(config.parserId)) return null;
  const allowGlobalFallback = globalFallbackAllowedParsers.has(config.parserId);
  const runtimeKey = `${runtimeKeyBase}\u0000${allowGlobalFallback ? "1" : "0"}`;

  const languageRuntime = config.loader(runtimeRoots, allowGlobalFallback);
  if (!languageRuntime) return null;

  const parser = getParser(language, languageRuntime, runtimeKey);
  if (!parser) return null;

  try {
    const tree = parser.parse(content);
    const symbolTypes = new Set(Object.keys(config.symbolKinds));
    const symbolNodes = collectNodesByType(tree.rootNode, symbolTypes);
    const out: SymbolRecord[] = [];

    for (const node of symbolNodes) {
      const kind = config.symbolKinds[node.type];
      if (!kind) continue;
      const name = detectNodeName(node, content);
      if (!name) continue;
      out.push({
        path,
        line: node.startPosition.row + 1,
        kind,
        name,
        signature_hint: maybeSignature(node, content),
      });
    }
    return out;
  } catch {
    return null;
  }
}

export function missingRequiredParsers(
  enabledParsers: Set<ParserId>,
  runtimeRoots: string[] = [],
  globalFallbackAllowedParsers: Set<ParserId> = new Set<ParserId>(),
): ParserId[] {
  const required = Object.values(RUNTIME_LANGUAGE_MAP).filter(
    (config): config is RuntimeLanguageConfig => Boolean(config),
  );
  const missing: ParserId[] = [];
  if (!PARSER_CLASS) {
    for (const config of required) {
      const parserId = config.parserId;
      if (!enabledParsers.has(parserId)) continue;
      if (!missing.includes(parserId)) missing.push(parserId);
    }
    return missing;
  }

  for (const config of required) {
    if (!enabledParsers.has(config.parserId)) continue;
    const runtime = config.loader(runtimeRoots, globalFallbackAllowedParsers.has(config.parserId));
    if (!runtime) missing.push(config.parserId);
  }
  return missing;
}

export const __internalSymbols = {
  permissionDenied,
  ensureBunTreeSitterPrebuildWith,
};
