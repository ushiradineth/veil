import { copyFileSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

import type { ParserId } from "./grammar-manager";
import type { SymbolRecord } from "./types";

type RuntimeLanguageConfig = {
  loader: () => unknown;
  parserId: ParserId;
  symbolKinds: Record<string, SymbolRecord["kind"]>;
};

const require = createRequire(import.meta.url);

function ensureBunTreeSitterPrebuild(): void {
  if (typeof process.versions.bun !== "string") return;
  try {
    const pkg = require.resolve("tree-sitter/package.json");
    const root = dirname(pkg);
    const expectedDir = join(root, "prebuilds", `${process.platform}-${process.arch}`);
    const expectedFile = join(expectedDir, "tree-sitter.node");
    if (existsSync(expectedFile)) return;

    const candidate = join(root, "build", "Release", "tree_sitter_runtime_binding.node");
    if (!existsSync(candidate)) return;

    mkdirSync(expectedDir, { recursive: true });
    try {
      symlinkSync(relative(expectedDir, candidate), expectedFile);
    } catch {
      if (!existsSync(expectedFile)) {
        copyFileSync(candidate, expectedFile);
      }
    }
  } catch {
    // ignored: runtime remains unavailable
  }
}

function loadParserClass(): ParserCtor | undefined {
  let parser = optionalModule("tree-sitter") as ParserCtor | undefined;
  if (parser) return parser;
  ensureBunTreeSitterPrebuild();
  parser = optionalModule("tree-sitter") as ParserCtor | undefined;
  return parser;
}

function optionalModule(name: string): unknown {
  try {
    return require(name);
  } catch {
    return undefined;
  }
}

function typescriptLanguage(): unknown {
  const mod = optionalModule("tree-sitter-typescript") as { typescript?: unknown } | undefined;
  return mod?.typescript ?? null;
}

const RUNTIME_LANGUAGE_MAP: Partial<Record<string, RuntimeLanguageConfig>> = {
  javascript: {
    loader: () => optionalModule("tree-sitter-javascript"),
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
    loader: () => optionalModule("tree-sitter-python"),
    parserId: "python",
    symbolKinds: {
      function_definition: "function",
      class_definition: "class",
    },
  },
  shell: {
    loader: () => optionalModule("tree-sitter-bash"),
    parserId: "bash",
    symbolKinds: {
      function_definition: "function",
    },
  },
  go: {
    loader: () => optionalModule("tree-sitter-go"),
    parserId: "go",
    symbolKinds: {
      function_declaration: "function",
      method_declaration: "method",
      type_declaration: "type",
    },
  },
  rust: {
    loader: () => optionalModule("tree-sitter-rust"),
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
): { parse: (content: string) => { rootNode: NodeLike } } | null {
  if (!PARSER_CLASS) return null;
  const cached = PARSER_CACHE.get(language);
  if (cached) return cached as { parse: (content: string) => { rootNode: NodeLike } };
  const parser = new PARSER_CLASS();
  parser.setLanguage(tsLanguage);
  PARSER_CACHE.set(language, parser);
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

export function extractSymbolsWithTreeSitter(
  path: string,
  language: string,
  content: string,
  enabledParsers: Set<ParserId>,
): SymbolRecord[] | null {
  if (language === "json") {
    return enabledParsers.has("json") ? [] : null;
  }
  const config = RUNTIME_LANGUAGE_MAP[language];
  if (!config) return null;
  if (!enabledParsers.has(config.parserId)) return null;

  const languageRuntime = config.loader();
  if (!languageRuntime) return null;

  const parser = getParser(language, languageRuntime);
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

export function missingRequiredParsers(enabledParsers: Set<ParserId>): ParserId[] {
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
    const runtime = config.loader();
    if (!runtime) missing.push(config.parserId);
  }
  return missing;
}
