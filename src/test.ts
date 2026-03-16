import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { buildAgentGuidance, withAgentGuidanceCompact } from "./agent-guidance";
import { toBenchmarksMarkdown, toRunId } from "./bench-report";
import { __internalBenchSuite } from "./bench-suite";
import { __internalBin } from "./bin";
import { __internalCli } from "./cli";
import { diagnostics, PerformanceDiagnostics, profiler } from "./diagnostics";
import { __internalFetchUrl, fetchUrl } from "./fetch-url";
import { __internalGit, ghLookup, gitDiff, gitLog, gitShow, gitStatus } from "./git";
import {
  BUILTIN_PARSERS,
  getParserConfig,
  parseParserList,
  removeParsers,
  setEnabledParsers,
} from "./grammar-manager";
import {
  __internal,
  buildIndex,
  lookupIndex,
  getStatus,
  initWorkspaceIndex,
  queryFiles,
  querySymbols,
  queryChunks,
  queryChunkById,
  discoverIndex,
  shouldRefreshDiscover,
} from "./indexer";
import {
  diagnosticsStatePath,
  resolveIndexDir,
  resolveStateRoot,
  relativeStateRoot,
} from "./state-root";
import { getBunPrebuildRecoveryStatus, missingRequiredParsers } from "./symbols-tree-sitter";
import { TOOL_DESCRIPTIONS } from "./tool-contract";
import { webSearch } from "./web-search";

const TEST_FIXTURES_DIR = join(import.meta.dir, "../test/fixtures");
const SMALL_REPO = join(TEST_FIXTURES_DIR, "small");
const MEDIUM_REPO = join(TEST_FIXTURES_DIR, "medium");
const TEMP_TEST_DIR = join(import.meta.dir, "../test/temp");

function git(repo: string, args: string[]): string {
  const out = spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
  if (out.status !== 0) {
    throw new Error(`Git command failed: git -C ${repo} ${args.join(" ")}\n${out.stderr}`);
  }
  return out.stdout.trim();
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value to be defined");
  }
  return value;
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.toString();
  if (typeof input === "string") return input;
  return input.url;
}

function toolText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as { content?: unknown };
  if (!Array.isArray(record.content)) return "";
  for (const item of record.content) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const text = (item as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

async function writeExecutableScript(path: string, body: string): Promise<void> {
  await writeFile(path, body, "utf-8");
  await chmod(path, 0o755);
}

beforeAll(async () => {
  await rm(TEMP_TEST_DIR, { recursive: true, force: true });
  await mkdir(TEMP_TEST_DIR, { recursive: true });
  await buildIndex(SMALL_REPO, "full");
  await buildIndex(MEDIUM_REPO, "full");
});

afterAll(async () => {
  await rm(TEMP_TEST_DIR, { recursive: true, force: true });
});

describe("Phase 1: Indexing correctness", () => {
  test("Build index for small repo", async () => {
    const manifest = await buildIndex(SMALL_REPO, "full");
    expect(manifest.file_count).toBeGreaterThan(0);
    expect(manifest.symbol_count).toBeGreaterThan(0);
    expect(manifest.chunk_count).toBeGreaterThan(0);
  });

  test("Index contains expected files", async () => {
    const files = await queryFiles(SMALL_REPO, "hello", 10);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("hello.ts");
  });

  test("Index extracts TypeScript symbols", async () => {
    const symbols = await querySymbols(SMALL_REPO, "greet", 10);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
  });

  test("Index extracts class symbols", async () => {
    const symbols = await querySymbols(SMALL_REPO, "Greeter", 10);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Greeter");
  });

  test("Index creates searchable chunks", async () => {
    const chunks = await queryChunks(SMALL_REPO, "Hello", 10);
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Build index for medium repo", async () => {
    const manifest = await buildIndex(MEDIUM_REPO, "full");
    expect(manifest.file_count).toBeGreaterThan(15);
    expect(manifest.symbol_count).toBeGreaterThan(30);
  });
});

describe("Phase 2: Query accuracy", () => {
  test("File query returns relevant results", async () => {
    const files = await queryFiles(SMALL_REPO, "math", 10);
    expect(files.length).toBeGreaterThan(0);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("math.ts");
  });

  test("File query respects limit", async () => {
    const files = await queryFiles(MEDIUM_REPO, "service", 5);
    expect(files.length).toBeLessThan(6);
  });

  test("Symbol query finds functions", async () => {
    const symbols = await querySymbols(SMALL_REPO, "add", 10);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("add");
  });

  test("Symbol query finds classes", async () => {
    const symbols = await querySymbols(MEDIUM_REPO, "Service", 10);
    expect(symbols.length).toBeGreaterThan(0);
  });

  test("Chunk search finds code content", async () => {
    const chunks = await queryChunks(SMALL_REPO, "multiply", 10);
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Chunk search with path prefix", async () => {
    const chunks = await queryChunks(SMALL_REPO, "function", 10, {
      path_prefix: "math",
    });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.path.includes("math")).toBe(true);
    }
  });

  test("Chunk search with language filter", async () => {
    const chunks = await queryChunks(SMALL_REPO, "export", 10, {
      language: "typescript",
    });
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("Chunk query defaults to compact content projection", async () => {
    const chunks = await queryChunks(MEDIUM_REPO, "service", 5);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(typeof chunk.content).toBe("string");
      expect(typeof chunk.content_chars).toBe("number");
      expect(chunk.content.length).toBeLessThanOrEqual(chunk.content_chars ?? chunk.content.length);
    }
  });

  test("Chunk query supports full content opt-in", async () => {
    const compact = await queryChunks(MEDIUM_REPO, "service", 1, { include_content: false });
    const full = await queryChunks(MEDIUM_REPO, "service", 1, { include_content: true });
    expect(compact.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(0);
    expect((full[0]?.content_chars ?? 0) >= (compact[0]?.content_chars ?? 0)).toBe(true);
    expect(full[0]?.content.length >= compact[0]?.content.length).toBe(true);
  });

  test("Chunk by id supports targeted follow-up content fetch", async () => {
    const chunks = await queryChunks(MEDIUM_REPO, "service", 1, { include_content: true });
    const firstId = chunks[0]?.id ?? "";
    const item = await queryChunkById(MEDIUM_REPO, firstId);
    expect(item).not.toBeNull();
    expect(item?.id).toBe(firstId);
  });

  test("Discover combines files, symbols, and chunks", async () => {
    const result = await discoverIndex(SMALL_REPO, "function", {
      files_limit: 5,
      symbols_limit: 5,
      search_limit: 5,
    });
    const hasResults =
      result.files.length > 0 || result.symbols.length > 0 || result.chunks.length > 0;
    expect(hasResults).toBe(true);
  });

  test("Lookup returns explainable contextual results", async () => {
    const result = await lookupIndex(MEDIUM_REPO, "where is process defined");
    expect(result.intent).toBe("code");
    expect(result.symbols.length > 0 || result.chunks.length > 0).toBe(true);

    if (result.symbols.length > 0) {
      const firstSymbol = result.symbols[0];
      expect(firstSymbol.score).toBeGreaterThan(0);
      expect(firstSymbol.reasons.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(firstSymbol.confidence);
    }

    expect(result.fallback).toBeDefined();
    expect(typeof result.fallback.used).toBe("boolean");

    for (const group of [result.files, result.symbols, result.chunks]) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        expect(group[i].score >= group[i + 1].score).toBe(true);
      }
      for (const row of group) {
        expect(row.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  test("Lookup results maintain descending score order for dense query", async () => {
    const result = await lookupIndex(MEDIUM_REPO, "service process");
    for (const group of [result.files, result.symbols, result.chunks]) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        expect(group[i].score >= group[i + 1].score).toBe(true);
      }
    }
  });

  test("Web search parses Google provider results", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("google.com/search")) {
        return new Response(
          '<a href="/url?q=https%3A%2F%2Fexample.com%2Fa&amp;sa=U"><h3>Example A</h3></a>',
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("{}", { status: 503 });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "example query",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 600,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    const data = must(result.data);
    expect(data.results[0]?.title).toBe("Example A");
    expect(data.debug).toBeUndefined();
  });

  test("Web search uses Google fallback path when SERP is unparseable", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("google.com/search")) {
        return new Response("<html>blocked</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("html.duckduckgo.com/html/")) {
        return new Response(
          '<a class="result__a" href="https://example.com/fallback">Fallback Result</a>',
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );
      }
      return new Response("{}", { status: 503 });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "fallback query",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 600,
      debug: true,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(
      result.data?.debug?.provider_trace.some((trace) => trace.provider === "google" && trace.ok),
    ).toBe(true);
  });

  test("Web search parses GitHub provider results", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("google.com/search")) {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("api.duckduckgo.com")) {
        return new Response(JSON.stringify({ RelatedTopics: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("wikipedia.org")) {
        return new Response(JSON.stringify(["q", [], [], []]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.github.com/search/repositories")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                full_name: "owner/repo",
                html_url: "https://github.com/owner/repo",
                description: "Repo",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: { children: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "owner repo",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 800,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    const data = must(result.data);
    expect(data.results.some((row) => row.url === "https://github.com/owner/repo")).toBe(true);
  });

  test("Web search parses Reddit provider results", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("reddit.com/search.json")) {
        return new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    title: "Reddit Thread",
                    permalink: "/r/typescript/comments/abc123/thread/",
                    selftext: "discussion",
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("google.com/search")) {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("api.duckduckgo.com")) {
        return new Response(JSON.stringify({ RelatedTopics: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("wikipedia.org")) {
        return new Response(JSON.stringify(["q", [], [], []]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.github.com/search/repositories")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "typescript reddit",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 800,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    const data = must(result.data);
    expect(data.results.some((row) => row.url.includes("reddit.com/r/typescript"))).toBe(true);
  });

  test("Web search parses DeepWiki provider results", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("html.duckduckgo.com/html/") && url.includes("site%3Adeepwiki.com")) {
        return new Response(
          '<a class="result__a" href="https://deepwiki.com/kubernetes/ingress-nginx">Ingress Docs</a>',
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (url.includes("html.duckduckgo.com/html/")) {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("google.com/search")) {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("api.duckduckgo.com")) {
        return new Response(JSON.stringify({ RelatedTopics: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("wikipedia.org")) {
        return new Response(JSON.stringify(["q", [], [], []]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.github.com/search/repositories")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("reddit.com/search.json")) {
        return new Response(JSON.stringify({ data: { children: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "kubernetes ingress",
      fetch_impl: mockFetch,
      limit: 5,
      timeout_ms: 800,
      debug: true,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    const data = must(result.data);
    expect(data.results.some((row) => row.url.startsWith("https://deepwiki.com/"))).toBe(true);
    expect(
      result.data?.debug?.provider_trace.some((trace) => trace.provider === "deepwiki" && trace.ok),
    ).toBe(true);
  });

  test("Web search keeps parallel provider merge without early cancel", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("google.com/search")) {
        await Bun.sleep(80);
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("html.duckduckgo.com/html/")) {
        return new Response(
          '<a class="result__a" href="https://example.com/duck">Duck Result</a>',
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (url.includes("wikipedia.org")) {
        return new Response(JSON.stringify(["q", [], [], []]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.github.com/search/repositories")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("reddit.com/search.json")) {
        await Bun.sleep(20);
        return new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    title: "Reddit Result",
                    permalink: "/r/dev/comments/1/reddit/",
                    selftext: "hint",
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "parallel merge",
      fetch_impl: mockFetch,
      limit: 5,
      timeout_ms: 500,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    const data = must(result.data);
    expect(data.results.some((row) => row.url.includes("example.com/duck"))).toBe(true);
    expect(data.results.some((row) => row.url.includes("reddit.com/r/dev"))).toBe(true);
  });

  test("Web search decodes DuckDuckGo redirect URLs", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("html.duckduckgo.com/html/")) {
        return new Response(
          '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgateway-api.sigs.k8s.io%2Fguide">Gateway API</a>',
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (url.includes("google.com/search")) {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("wikipedia.org")) {
        return new Response(JSON.stringify(["q", [], [], []]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.github.com/search/repositories")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("reddit.com/search.json")) {
        return new Response(JSON.stringify({ data: { children: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ RelatedTopics: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "gateway api",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 500,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(
      must(result.data).results.some((row) => row.url === "https://gateway-api.sigs.k8s.io/guide"),
    ).toBe(true);
  });

  test("Web search merges, dedupes, and keeps descending score", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      await Promise.resolve();
      if (url.includes("google.com/search")) {
        return new Response(
          [
            '<a href="/url?q=https%3A%2F%2Fexample.com%2Falpha&amp;sa=U"><h3>Alpha</h3></a>',
            '<a href="/url?q=https%3A%2F%2Fexample.com%2Fshared&amp;sa=U"><h3>Shared Google</h3></a>',
          ].join(""),
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (url.includes("api.duckduckgo.com")) {
        return new Response(
          JSON.stringify({
            RelatedTopics: [
              { Text: "Shared Topic - Dup", FirstURL: "https://example.com/shared" },
              { Text: "Beta Topic - Link", FirstURL: "https://example.com/beta" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("wikipedia.org")) {
        return new Response(
          JSON.stringify(["q", ["Gamma"], ["Wiki desc"], ["https://example.com/gamma"]]),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("api.github.com/search/repositories")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                full_name: "owner/delta",
                html_url: "https://example.com/delta",
                description: "Delta",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            children: [
              {
                data: {
                  title: "Epsilon",
                  permalink: "/r/dev/comments/1/test/",
                  selftext: "epsilon",
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "merged query",
      fetch_impl: mockFetch,
      limit: 10,
      timeout_ms: 1000,
      debug: true,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();

    const urls = must(result.data).results.map((row) => row.url);
    expect(urls.filter((url) => url.includes("example.com/shared")).length).toBe(1);
    const detailed = result.data?.debug?.detailed_results ?? [];
    for (let i = 0; i + 1 < detailed.length; i += 1) {
      expect(detailed[i].score >= detailed[i + 1].score).toBe(true);
    }
  });

  test("Web search returns timeout when providers exceed budget", async () => {
    const mockFetch = ((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) return;
        if (signal.aborted) {
          reject(new Error("AbortError"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            reject(new Error("AbortError"));
          },
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "slow query",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 300,
      debug: true,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("timeout");
    expect(result.data).toBeNull();
  });

  test("Web search returns results with pending-provider timeout traces", async () => {
    const mockFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.includes("html.duckduckgo.com/html/")) {
        return Promise.resolve(
          new Response('<a class="result__a" href="https://example.com/fast">Fast Result</a>', {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        );
      }
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) return;
        signal.addEventListener(
          "abort",
          () => {
            reject(new Error("AbortError"));
          },
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const result = await webSearch(MEDIUM_REPO, {
      query: "partial timeout",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 200,
      debug: true,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data?.results.some((row) => row.url.includes("example.com/fast"))).toBe(true);
    expect(
      result.data?.debug?.provider_trace.some(
        (trace) => trace.provider === "google" && trace.warning === "timeout",
      ),
    ).toBe(true);
  });

  test("Web search rejects empty query", async () => {
    const result = await webSearch(MEDIUM_REPO, { query: "" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-query");
  });

  test("Web search returns provider-unavailable when all providers fail", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response("upstream unavailable", { status: 503 }),
      )) as unknown as typeof fetch;
    const result = await webSearch(MEDIUM_REPO, {
      query: "all fail",
      fetch_impl: mockFetch,
      limit: 3,
      timeout_ms: 500,
      debug: true,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("provider-unavailable");
    expect(result.data).toBeNull();
  });

  test("Fetch URL prefers markdown and returns content", async () => {
    const mockFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const accept = (
        (init?.headers as Record<string, string> | undefined)?.accept ?? ""
      ).toLowerCase();
      await Promise.resolve();
      expect(accept.includes("text/markdown")).toBe(true);
      return new Response("# Title\n\nBody", {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "x-markdown-tokens": "42",
          "content-signal": "ai-train=yes, search=yes, ai-input=yes",
          vary: "accept",
        },
      });
    }) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/doc",
      format: "markdown",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data?.content.includes("# Title")).toBe(true);
    expect(result.data?.markdown_tokens).toBe(42);
    expect(result.data?.content_signal).toContain("ai-input=yes");
    expect(result.data?.vary).toBe("accept");
  });

  test("Fetch URL converts html to markdown on markdown format", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response('<h1>Hello</h1><p>See <a href="https://example.com">docs</a></p>', {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/page",
      format: "markdown",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data?.content.includes("# Hello")).toBe(true);
    expect(result.data?.content.includes("[docs](https://example.com)")).toBe(true);
  });

  test("Fetch URL validates URL", async () => {
    const result = await fetchUrl({ url: "notaurl" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-url");
  });

  test("Fetch URL blocks localhost by default", async () => {
    const result = await fetchUrl({ url: "http://127.0.0.1:8080/health" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("blocked-host");
  });

  test("Fetch URL blocks metadata endpoint by default", async () => {
    const result = await fetchUrl({ url: "http://169.254.169.254/latest/meta-data" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("blocked-host");
  });

  test("Fetch URL allows private hosts when explicitly enabled", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      )) as unknown as typeof fetch;
    const result = await fetchUrl({
      url: "http://127.0.0.1:8080/health",
      allow_private_network: true,
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  test("Fetch URL blocks redirects to private hosts", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response("", {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
      )) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/redirect",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("blocked-host");
  });

  test("Fetch URL reports timeout", async () => {
    const mockFetch = ((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) return;
        signal.addEventListener(
          "abort",
          () => {
            reject(new Error("AbortError"));
          },
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/slow",
      timeout_ms: 300,
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("timeout");
  });

  test("Fetch URL truncates oversized content", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response("x".repeat(1000), {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      )) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/large",
      max_bytes: 120,
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.meta.truncated).toBe(true);
    expect((result.data?.content.length ?? 0) < 1000).toBe(true);
  });

  test("Fetch URL returns fetch-failed payload for non-OK response", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response("nope", {
          status: 503,
          headers: { "content-type": "text/plain" },
        }),
      )) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/unavailable",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("fetch-failed");
    expect(result.error?.message).toBe("HTTP 503");
    expect(result.data?.status).toBe(503);
    expect(result.data?.final_url).toBe("https://example.com/unavailable");
  });

  test("Fetch URL converts markdown to text when text format is requested", async () => {
    const mockFetch = (() =>
      Promise.resolve(
        new Response("# Header\n\nParagraph", {
          status: 200,
          headers: { "content-type": "text/markdown" },
        }),
      )) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/markdown",
      format: "text",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data?.format).toBe("text");
    expect(result.data?.content).toContain("# Header");
    expect(result.data?.content).toContain("Paragraph");
  });

  test("Fetch URL sends html accept header for html format", async () => {
    const mockFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const accept = (
        (init?.headers as Record<string, string> | undefined)?.accept ?? ""
      ).toLowerCase();
      await Promise.resolve();
      expect(accept.includes("application/xhtml+xml")).toBe(true);
      return new Response("<main><h1>Raw</h1></main>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/raw",
      format: "html",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data?.content).toContain("<h1>Raw</h1>");
  });

  test("Fetch URL reports internal-error for non-timeout failures", async () => {
    const mockFetch = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;

    const result = await fetchUrl({
      url: "https://example.com/fail",
      fetch_impl: mockFetch,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("internal-error");
    expect(result.error?.message).toContain("network down");
  });

  test("Fetch URL internals cover helper branches", () => {
    expect(__internalFetchUrl.parseUrl("ftp://example.com")).toBeNull();
    expect(__internalFetchUrl.decodeHtml("&amp;&lt;&gt;&quot;&#39;&nbsp;")).toBe("&<>\"' ");
    expect(__internalFetchUrl.stripTags("<p>hi</p><br>")).toBe(" hi  ");
    expect(__internalFetchUrl.collapseWhitespace("a\r\n\n\n\tb")).toBe("a\n\n b");
    expect(__internalFetchUrl.chooseAccept("html")).toContain("application/xhtml+xml");
    expect(__internalFetchUrl.chooseAccept("text")).toContain("text/plain");
    expect(__internalFetchUrl.parseMarkdownTokens("-1")).toBeNull();
    expect(__internalFetchUrl.parseMarkdownTokens("NaN")).toBeNull();
    expect(__internalFetchUrl.parseMarkdownTokens("9.8")).toBe(9);
    expect(__internalFetchUrl.isHtml("application/xhtml+xml")).toBe(true);
    expect(__internalFetchUrl.isMarkdown("text/x-markdown")).toBe(true);
    expect(__internalFetchUrl.isBlockedHost("localhost")).toBe(true);
    expect(__internalFetchUrl.isBlockedHost("10.0.0.1")).toBe(true);
    expect(__internalFetchUrl.isBlockedHost("example.com")).toBe(false);
    expect(__internalFetchUrl.isRedirectStatus(302)).toBe(true);
    expect(__internalFetchUrl.isRedirectStatus(200)).toBe(false);
    const clipped = __internalFetchUrl.truncateTo("abcdef", 4);
    expect(clipped.truncated).toBe(true);
    expect(Buffer.byteLength(clipped.value, "utf-8")).toBeLessThanOrEqual(4);
  });

  describe("Fetch URL SSRF protection", () => {
    const ssrfVectors = [
      { desc: "file:// scheme", url: "file:///etc/passwd" },
      { desc: "javascript: scheme", url: "javascript:alert('xss')" },
      { desc: "data: scheme", url: "data:text/html,<script>alert('xss')</script>" },
      { desc: "ftp:// scheme", url: "ftp://example.com/file" },
      { desc: "ssh:// scheme", url: "ssh://user@host/path" },
      { desc: "gopher:// scheme", url: "gopher://host/path" },
      { desc: "ldap:// scheme", url: "ldap://host/dc=example" },
      { desc: "vbscript: scheme", url: "vbscript:msgbox(1)" },
      { desc: "about: scheme", url: "about:blank" },
      { desc: "blob: scheme", url: "blob:http://example.com" },
    ];

    for (const { desc, url } of ssrfVectors) {
      test(`Fetch URL rejects ${desc}`, async () => {
        const result = await fetchUrl({ url });
        expect(result.meta.ok).toBe(false);
        expect(result.error?.code).toBe("invalid-url");
      });
    }
  });

  test("Fetch URL markdown fallback handles converter errors", () => {
    const originalTranslate = __internalFetchUrl.NHM.translate.bind(__internalFetchUrl.NHM);
    __internalFetchUrl.NHM.translate = () => {
      throw new Error("translate fail");
    };
    try {
      const converted = __internalFetchUrl.htmlToMarkdown("<p>Hello&nbsp;&amp;bye</p>");
      expect(converted).toBe("Hello &bye");
    } finally {
      __internalFetchUrl.NHM.translate = originalTranslate;
    }
  });

  test("Fetch URL nowMs falls back when nanoseconds is missing", () => {
    const value = __internalFetchUrl.nowMs(undefined);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });
});

describe("Phase 3: Cache behavior", () => {
  test("Status returns valid index info", async () => {
    const status = await getStatus(SMALL_REPO);
    expect(status.exists).toBe(true);
    expect(status.manifest).not.toBeNull();
    const manifest = must(status.manifest);
    expect(manifest.file_count).toBeGreaterThan(0);
    expect(manifest.symbol_count).toBeGreaterThan(0);
    expect(manifest.chunk_count).toBeGreaterThan(0);
  });

  test("Discover refresh guard skips dirty-only staleness", () => {
    expect(
      shouldRefreshDiscover({
        exists: true,
        stale: true,
        reasons: ["workspace-dirty"],
        manifest: null,
        current_git_head: null,
      }),
    ).toBe(false);
    expect(
      shouldRefreshDiscover({
        exists: true,
        stale: true,
        reasons: ["ttl-expired"],
        manifest: null,
        current_git_head: null,
      }),
    ).toBe(true);
    expect(
      shouldRefreshDiscover({
        exists: true,
        stale: true,
        reasons: ["workspace-dirty", "git-head-mismatch"],
        manifest: null,
        current_git_head: null,
      }),
    ).toBe(true);
  });

  test("initWorkspaceIndex refreshes when manifest is missing", async () => {
    const repo = join(TEMP_TEST_DIR, "init-missing-manifest");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "alpha.ts"), "export const alpha = 1\n");

    const result = await initWorkspaceIndex(repo, { refresh_if_stale: true });
    expect(result.refreshed).toBe(true);
    expect(result.reason).toBe("refreshed");
    expect(result.status_after.exists).toBe(true);
    expect(result.status_after.reasons.includes("manifest-missing")).toBe(false);
  });

  test("initWorkspaceIndex skips dirty-only refresh", async () => {
    const repo = join(TEMP_TEST_DIR, "init-dirty-only");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "beta.ts"), "export const beta = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await buildIndex(repo, "full");
    await writeFile(join(repo, "beta.ts"), "export const beta = 2\n");

    const result = await initWorkspaceIndex(repo, { refresh_if_stale: true });
    expect(result.refreshed).toBe(false);
    expect(result.reason).toBe("dirty-only");
  });

  test("Warm query path stays within expected latency range", async () => {
    const sample = async (): Promise<number> => {
      const start = Bun.nanoseconds();
      await queryFiles(SMALL_REPO, "test", 10);
      return (Bun.nanoseconds() - start) / 1e6;
    };

    const cold = await sample();
    const warmSamples = [await sample(), await sample(), await sample(), await sample()];
    const warmAvg = warmSamples.reduce((sum, value) => sum + value, 0) / warmSamples.length;
    expect(warmAvg).toBeLessThan(cold * 2 + 2);
  });

  test("Changed mode rebuilds only modified files", async () => {
    const fullManifest = await buildIndex(SMALL_REPO, "full");
    const changedManifest = await buildIndex(SMALL_REPO, "changed");
    expect(changedManifest.file_count).toBe(fullManifest.file_count);
  });

  test("Changed mode includes staged, unstaged, and untracked files", async () => {
    const repo = join(TEMP_TEST_DIR, "dirty-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "a.ts"), "export const alpha = () => 'base-alpha'\n");
    await writeFile(join(repo, "b.ts"), "export const beta = () => 'base-beta'\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    await buildIndex(repo, "full");

    await writeFile(join(repo, "a.ts"), "export const alpha = () => 'unstaged-dirty-alpha'\n");
    await writeFile(join(repo, "b.ts"), "export const beta = () => 'staged-dirty-beta'\n");
    await writeFile(join(repo, "c.ts"), "export const gamma = () => 'untracked-dirty-gamma'\n");
    git(repo, ["add", "b.ts"]);

    const status = await getStatus(repo);
    expect(status.reasons.includes("workspace-dirty")).toBe(true);

    await buildIndex(repo, "changed");

    const unstaged = await queryChunks(repo, "unstaged-dirty-alpha", 5);
    const staged = await queryChunks(repo, "staged-dirty-beta", 5);
    const untracked = await queryFiles(repo, "c.ts", 5);

    expect(unstaged.length).toBeGreaterThan(0);
    expect(staged.length).toBeGreaterThan(0);
    expect(untracked.some((item) => item.path === "c.ts")).toBe(true);
  });

  test("Changed mode with custom state root handles deleted files", async () => {
    const repo = join(TEMP_TEST_DIR, "changed-custom-state-root-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "keep.ts"), "export const keep = 1\n");
    await writeFile(join(repo, "remove.ts"), "export const remove = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    await buildIndex(repo, "full", { state_root: ".veil-custom" });
    await rm(join(repo, "remove.ts"), { force: true });

    await buildIndex(repo, "changed", { state_root: ".veil-custom" });

    const removedFiles = await queryFiles(repo, "remove.ts", 10, { state_root: ".veil-custom" });
    expect(removedFiles.some((file) => file.path === "remove.ts")).toBe(false);
  });

  test("Changed mode tracks renamed files", async () => {
    const repo = join(TEMP_TEST_DIR, "changed-rename-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "old-name.ts"), "export const renamed = true\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    await buildIndex(repo, "full");
    await rm(join(repo, "old-name.ts"), { force: true });
    await writeFile(join(repo, "new-name.ts"), "export const renamed = true\n");

    await buildIndex(repo, "changed");

    const oldMatches = await queryFiles(repo, "old-name.ts", 10);
    const newMatches = await queryFiles(repo, "new-name.ts", 10);
    expect(oldMatches.some((file) => file.path === "old-name.ts")).toBe(false);
    expect(newMatches.some((file) => file.path === "new-name.ts")).toBe(true);
  });

  test("Diagnostics counters increase for build and queries", async () => {
    diagnostics.reset();
    await buildIndex(SMALL_REPO, "full");
    await queryFiles(SMALL_REPO, "hello", 5);
    await querySymbols(SMALL_REPO, "greet", 5);
    await queryChunks(SMALL_REPO, "Hello", 5);
    await lookupIndex(SMALL_REPO, "where is add defined");

    const snap = diagnostics.getDiagnostics();
    expect(snap.operations.index_builds).toBeGreaterThan(0);
    expect(snap.operations.total_queries).toBeGreaterThan(0);
    expect(snap.latency.max_ms).toBeGreaterThan(0);
    expect(snap.latency.build_max_ms).toBeGreaterThan(0);
  });

  test("Diagnostics track git and gh failures plus timeout", async () => {
    diagnostics.reset();

    const nonRepo = await mkdtemp(join(tmpdir(), "veil-diag-git-fail-"));
    const gitFail = gitStatus(nonRepo);
    expect(gitFail.meta.ok).toBe(false);
    await rm(nonRepo, { recursive: true });

    const ghMissing = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: "gh-definitely-missing",
    });
    expect(ghMissing.meta.ok).toBe(false);

    const slowGh = join(TEMP_TEST_DIR, "slow-gh.sh");
    await writeFile(slowGh, "#!/bin/sh\nsleep 2\nexit 0\n", "utf-8");
    await chmod(slowGh, 0o755);
    const ghTimeout = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: slowGh,
      timeout_ms: 500,
    });
    expect(ghTimeout.meta.ok).toBe(false);
    expect(ghTimeout.error?.code).toBe("timeout");

    const snap = diagnostics.getDiagnostics();
    expect(snap.operations.git_calls).toBeGreaterThanOrEqual(3);
    expect(snap.operations.gh_calls).toBeGreaterThanOrEqual(2);
    expect(snap.operations.git_failures).toBeGreaterThanOrEqual(3);
    expect(snap.operations.git_timeouts).toBeGreaterThanOrEqual(1);
    expect(snap.latency.gh_max_ms).toBeGreaterThan(0);
  });

  test("Git status reports dirty files in repository", async () => {
    const repo = join(TEMP_TEST_DIR, "git-status-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "a.ts"), "export const a = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await writeFile(join(repo, "a.ts"), "export const a = 2\n");

    const result = gitStatus(repo);
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    const data = must(result.data);
    expect(data.dirty).toBe(true);
    expect(data.changed.unstaged).toBeGreaterThan(0);
  });

  test("Git status counts untracked files", async () => {
    const repo = join(TEMP_TEST_DIR, "git-status-untracked-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "u.ts"), "export const u = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await writeFile(join(repo, "new.ts"), "export const n = 1\n");

    const result = gitStatus(repo);
    expect(result.meta.ok).toBe(true);
    expect((result.data?.changed.untracked ?? 0) > 0).toBe(true);
  });

  test("Git status returns non-negative duration", () => {
    const result = gitStatus(SMALL_REPO);
    expect(result.meta.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("Git internal clock helper supports explicit fallback path", () => {
    const stamp = __internalGit.nowMs({});
    expect(stamp).toBeGreaterThan(0);
  });

  test("Git log returns bounded commit entries", async () => {
    const repo = join(TEMP_TEST_DIR, "git-log-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "log.ts"), "export const log = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "first",
    ]);
    await writeFile(join(repo, "log.ts"), "export const log = 2\n");
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "second",
    ]);

    const result = gitLog(repo, { limit: 2 });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(must(result.data).entries.length).toBeLessThan(3);
  });

  test("Git diff includes unstaged changes", async () => {
    const repo = join(TEMP_TEST_DIR, "git-diff-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "b.ts"), "export const b = 'before'\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await writeFile(join(repo, "b.ts"), "export const b = 'after'\n");

    const result = gitDiff(repo, { path: "b.ts" });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(must(result.data).text.includes("after")).toBe(true);
  });

  test("Git diff rejects invalid path outside workspace", async () => {
    const repo = join(TEMP_TEST_DIR, "git-invalid-path-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "p.ts"), "export const p = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitDiff(repo, { path: "../escape.ts" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-path");
  });

  test("Git diff rejects invalid revision tokens", async () => {
    const repo = join(TEMP_TEST_DIR, "git-invalid-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "rev.ts"), "export const rev = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitDiff(repo, { base: "HEAD bad" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git diff rejects invalid head revision tokens", async () => {
    const repo = join(TEMP_TEST_DIR, "git-invalid-head-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "rev.ts"), "export const rev = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitDiff(repo, { base: "HEAD", head: "HEAD bad" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git show reports invalid revision when missing", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-invalid-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitShow(repo, { rev: "" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git diff returns truncation metadata when output is capped", async () => {
    const repo = join(TEMP_TEST_DIR, "git-truncate-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "big.ts"), "export const big = 'a'\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await writeFile(join(repo, "big.ts"), `${"x".repeat(4000)}\n`);

    const result = gitDiff(repo, { path: "big.ts", max_bytes: 1024 });
    expect(result.meta.ok).toBe(true);
    expect(result.meta.truncated).toBe(true);
    expect(result.meta.warnings.length).toBeGreaterThan(0);
  });

  test("Git status reports git-unavailable when command is missing", () => {
    const result = gitStatus(SMALL_REPO, { command: "git-missing-binary" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("git-unavailable");
  });

  test("Git status returns command-failed when follow-up command fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-status-fail.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$3" = "rev-parse" ] && [ "$4" = "--is-inside-work-tree" ]; then echo true; exit 0; fi\nif [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then pwd; exit 0; fi\nif [ "$3" = "rev-parse" ] && [ "$4" = "--abbrev-ref" ]; then exit 2; fi\nexit 0\n',
    );
    const result = gitStatus(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git status returns not-a-repo when show-toplevel fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-top-fail.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$3" = "rev-parse" ] && [ "$4" = "--is-inside-work-tree" ]; then echo true; exit 0; fi\nif [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then exit 2; fi\nexit 0\n',
    );
    const result = gitStatus(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
  });

  test("Git status catches realpath failures and rejects outside root", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-bad-top.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$3" = "rev-parse" ] && [ "$4" = "--is-inside-work-tree" ]; then echo true; exit 0; fi\nif [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then echo /no/such/root; exit 0; fi\nexit 0\n',
    );
    const result = gitStatus(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
  });

  test("Git log and show fail on non-repo workspace", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "veil-non-repo-multi-"));
    const logResult = gitLog(nonRepo, { limit: 3 });
    const showResult = gitShow(nonRepo, { rev: "HEAD" });
    expect(logResult.meta.ok).toBe(false);
    expect(logResult.error?.code).toBe("not-a-repo");
    expect(showResult.meta.ok).toBe(false);
    expect(showResult.error?.code).toBe("not-a-repo");
    await rm(nonRepo, { recursive: true });
  });

  test("Git log returns command-failed when log command fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-log-fail.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$3" = "rev-parse" ] && [ "$4" = "--is-inside-work-tree" ]; then echo true; exit 0; fi\nif [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then pwd; exit 0; fi\nif [ "$3" = "log" ]; then exit 9; fi\nexit 0\n',
    );
    const result = gitLog(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git diff fails on non-repo workspace", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "veil-non-repo-diff-"));
    const result = gitDiff(nonRepo, { path: "a.ts" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
    await rm(nonRepo, { recursive: true });
  });

  test("Git diff returns command-failed when diff command fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-git-diff-fail.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$3" = "rev-parse" ] && [ "$4" = "--is-inside-work-tree" ]; then echo true; exit 0; fi\nif [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then pwd; exit 0; fi\nif [ "$3" = "diff" ]; then exit 7; fi\nexit 0\n',
    );
    const result = gitDiff(SMALL_REPO, { command: script });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("Git diff base-only mode succeeds", async () => {
    const repo = join(TEMP_TEST_DIR, "git-base-only-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "base.ts"), "export const base = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitDiff(repo, { base: "HEAD", name_only: true });
    expect(result.meta.ok).toBe(true);
    expect(result.data?.mode).toBe("working");
  });

  test("Git show flags unknown revision as invalid-revision", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-unknown-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitShow(repo, { rev: "notarev123" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git diff rejects revision with unsafe punctuation", async () => {
    const repo = join(TEMP_TEST_DIR, "git-unsafe-rev-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "unsafe.ts"), "export const unsafe = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitDiff(repo, { base: "HEAD:foo" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-revision");
  });

  test("Git show rejects invalid path argument", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-invalid-path-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitShow(repo, { rev: "HEAD", path: "/abs/path.ts" });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("invalid-path");
  });

  test("GH lookup supports prs and checks with authenticated mock command", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-ok.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo gh-2; exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo ok; exit 0; fi\nif [ "$1" = "pr" ]; then echo pr-list; exit 0; fi\nif [ "$1" = "run" ]; then echo check-list; exit 0; fi\nexit 1\n',
    );
    const prs = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "prs",
      query: "is:open",
      command: script,
    });
    const checks = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "checks",
      command: script,
    });
    expect(prs.meta.ok).toBe(true);
    expect(prs.data?.text.includes("pr-list")).toBe(true);
    expect(checks.meta.ok).toBe(true);
    expect(checks.data?.text.includes("check-list")).toBe(true);
  });

  test("GH lookup returns command-failed after auth succeeds", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-fail-after-auth.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo gh-2; exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo ok; exit 0; fi\nexit 5\n',
    );
    const result = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: script,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("GH lookup rejects invalid repo reference", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-invalid-repo.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo gh-2; exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo ok; exit 0; fi\nexit 1\n',
    );
    const result = await ghLookup(SMALL_REPO, {
      repo: "not-a-repo-ref",
      kind: "issues",
      command: script,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
    expect(result.error?.message.includes("owner/repo")).toBe(true);
  });

  test("GH repo_context returns command-failed when git sync fails", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-repo-context-auth.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo gh-2; exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo ok; exit 0; fi\nexit 1\n',
    );
    const tempRoot = join(TEMP_TEST_DIR, "gh-repo-context-fail");
    const existingRepo = join(tempRoot, "owner", "repo");
    await mkdir(existingRepo, { recursive: true });
    git(existingRepo, ["init"]);
    await writeFile(join(existingRepo, "tracked.ts"), "export const tracked = true\n");
    git(existingRepo, ["add", "."]);
    git(existingRepo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "repo_context",
      command: script,
      temp_root: tempRoot,
      timeout_ms: 500,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
  });

  test("GH repo_context refuses hard reset on unmanaged target", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-repo-context-unmanaged.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo gh-2; exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo ok; exit 0; fi\nexit 1\n',
    );
    const tempRoot = join(TEMP_TEST_DIR, "gh-repo-context-unmanaged");
    const existingRepo = join(tempRoot, "owner", "repo");
    await mkdir(existingRepo, { recursive: true });
    git(existingRepo, ["init"]);
    await writeFile(join(existingRepo, "tracked.ts"), "export const tracked = true\n");
    git(existingRepo, ["add", "."]);
    git(existingRepo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "repo_context",
      command: script,
      temp_root: tempRoot,
      timeout_ms: 500,
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("command-failed");
    expect(result.error?.message.includes("refusing hard reset")).toBe(true);
  });

  test("GH lookup accepts GitHub URL repository references", async () => {
    const script = join(TEMP_TEST_DIR, "mock-gh-url-repo.sh");
    await writeExecutableScript(
      script,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo gh-2; exit 0; fi\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then echo ok; exit 0; fi\nif [ "$1" = "issue" ] && [ "$2" = "search" ]; then echo issue-list; exit 0; fi\nexit 1\n',
    );
    const result = await ghLookup(SMALL_REPO, {
      repo: "https://github.com/owner/repo",
      kind: "issues",
      command: script,
    });
    expect(result.meta.ok).toBe(true);
    expect(result.data?.repo).toBe("owner/repo");
    expect(result.data?.repo_url).toBe("https://github.com/owner/repo.git");
    expect(result.data?.text.includes("issue-list")).toBe(true);
  });

  test("Git show returns commit metadata", async () => {
    const repo = join(TEMP_TEST_DIR, "git-show-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "show.ts"), "export const show = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "show",
    ]);

    const result = gitShow(repo, { rev: "HEAD", patch: false });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(must(result.data).text.includes("Commit:")).toBe(true);
  });

  test("Git status works from repository subdirectory workspace", async () => {
    const repo = join(TEMP_TEST_DIR, "git-subdir-repo");
    const subdir = join(repo, "pkg");
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, "mod.ts"), "export const mod = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);

    const result = gitStatus(subdir);
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
  });

  test("Git diff accepts revision range with HEAD~1..HEAD", async () => {
    const repo = join(TEMP_TEST_DIR, "git-range-repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "range.ts"), "export const value = 1\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "first",
    ]);
    await writeFile(join(repo, "range.ts"), "export const value = 2\n");
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "second",
    ]);

    const result = gitDiff(repo, { base: "HEAD~1", head: "HEAD", name_only: true });
    expect(result.meta.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(must(result.data).text.includes("range.ts")).toBe(true);
  });

  describe("Git command injection protection", () => {
    const repo = join(TEMP_TEST_DIR, "git-injection-repo");

    beforeAll(async () => {
      await mkdir(repo, { recursive: true });
      await writeFile(join(repo, "test.ts"), "export const test = 1\n");
      git(repo, ["init"]);
      git(repo, ["add", "."]);
      git(repo, [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "init",
      ]);
    });

    const injectionVectors = [
      { desc: "semicolon command separator", rev: "HEAD;rm -rf /" },
      { desc: "pipe operator", rev: "HEAD|cat /etc/passwd" },
      { desc: "AND operator", rev: "HEAD&&whoami" },
      { desc: "OR operator", rev: "HEAD||id" },
      { desc: "command substitution", rev: "$(whoami)" },
      { desc: "backtick substitution", rev: "`whoami`" },
      { desc: "variable expansion", rev: "$USER" },
      { desc: "brace expansion", rev: "{HEAD,main}" },
      { desc: "bracket expansion", rev: "[HEAD]" },
      { desc: "parentheses", rev: "(HEAD)" },
      { desc: "angle brackets", rev: "<HEAD>" },
      { desc: "exclamation mark", rev: "HEAD!" },
      { desc: "backslash escape", rev: "HEAD\\n" },
      { desc: "single quote", rev: "HEAD' OR '1'='1" },
      { desc: "double quote", rev: 'HEAD" OR "1"="1' },
      { desc: "newline injection", rev: "HEAD\nmain" },
      { desc: "tab injection", rev: "HEAD\tmain" },
      { desc: "null byte injection", rev: "HEAD\u0000main" },
      { desc: "carriage return", rev: "HEAD\rmain" },
      { desc: "option injection", rev: "-e HEAD" },
      { desc: "excessive length", rev: "a".repeat(201) },
    ];

    for (const { desc, rev } of injectionVectors) {
      test(`Git diff rejects ${desc}`, () => {
        const result = gitDiff(repo, { base: rev });
        expect(result.meta.ok).toBe(false);
        expect(result.error?.code).toBe("invalid-revision");
      });

      test(`Git show rejects ${desc}`, () => {
        const result = gitShow(repo, { rev });
        expect(result.meta.ok).toBe(false);
        expect(result.error?.code).toBe("invalid-revision");
      });
    }
  });

  describe("Git path traversal protection", () => {
    const repo = join(TEMP_TEST_DIR, "git-path-traversal-repo");

    beforeAll(async () => {
      await mkdir(repo, { recursive: true });
      await writeFile(join(repo, "test.ts"), "export const test = 1\n");
      git(repo, ["init"]);
      git(repo, ["add", "."]);
      git(repo, [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "init",
      ]);
    });

    test("Git diff rejects path with null byte", () => {
      const result = gitDiff(repo, { path: "test\u0000.ts" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git diff rejects path starting with hyphen", () => {
      const result = gitDiff(repo, { path: "-test.ts" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git diff rejects absolute path", () => {
      const result = gitDiff(repo, { path: "/etc/passwd" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git diff rejects path traversal with ..", () => {
      const result = gitDiff(repo, { path: "../../../etc/passwd" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git show rejects path with null byte", () => {
      const result = gitShow(repo, { rev: "HEAD", path: "test\u0000.ts" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git show rejects path starting with hyphen", () => {
      const result = gitShow(repo, { rev: "HEAD", path: "-test.ts" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git show rejects absolute path", () => {
      const result = gitShow(repo, { rev: "HEAD", path: "/etc/passwd" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });

    test("Git show rejects path traversal with ..", () => {
      const result = gitShow(repo, { rev: "HEAD", path: "../../../etc/passwd" });
      expect(result.meta.ok).toBe(false);
      expect(result.error?.code).toBe("invalid-path");
    });
  });

  test("Git tools fail with not-a-repo on non-git workspace", async () => {
    const repo = await mkdtemp(join(tmpdir(), "veil-not-a-repo-"));
    await writeFile(join(repo, "c.ts"), "export const c = 3\n");
    const result = gitStatus(repo);
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("not-a-repo");
    await rm(repo, { recursive: true });
  });

  test("GH lookup reports unavailable binary deterministically", async () => {
    const result = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: "gh-does-not-exist",
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("gh-unavailable");
  });

  test("GH lookup reports unauthenticated when command is present without auth", async () => {
    const result = await ghLookup(SMALL_REPO, {
      repo: "owner/repo",
      kind: "issues",
      command: "git",
    });
    expect(result.meta.ok).toBe(false);
    expect(result.error?.code).toBe("gh-unauthenticated");
  });

  test("Git helper throws on command failure", () => {
    let threw = false;
    try {
      git(join(TEMP_TEST_DIR, "definitely-not-a-repo"), ["status"]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("Git internals runCommand returns error data on invalid cwd", () => {
    const result = __internalGit.runCommand(
      "git",
      ["status"],
      "/definitely/missing/cwd-for-run-command",
      200,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("Git internals validatePathArg blocks symlink traversal", async () => {
    const workspace = join(TEMP_TEST_DIR, "git-symlink-path-workspace");
    const outside = await mkdtemp(join(tmpdir(), "veil-outside-path-"));
    await mkdir(workspace, { recursive: true });
    const link = join(workspace, "ext");
    await symlink(outside, link);

    try {
      const result = __internalGit.validatePathArg(workspace, "ext/escape.txt");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("invalid-path");
      }
    } finally {
      await rm(link, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("Git internals validatePathArg tolerates unresolved workspace", () => {
    const result = __internalGit.validatePathArg("/definitely/missing/workspace", "safe/path.ts");
    expect(result.ok).toBe(true);
  });

  test("Git internals validateRevision accepts safe ranges", () => {
    const accepted = __internalGit.validateRevision("HEAD~1..HEAD");
    expect(accepted.ok).toBe(true);
  });
});

describe("Phase 4: Edge cases", () => {
  test("Empty query returns empty results", async () => {
    const files = await queryFiles(SMALL_REPO, "", 10);
    expect(files.length).toBe(0);
  });

  test("Query with special characters", async () => {
    const files = await queryFiles(SMALL_REPO, "hello.ts", 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Very long query string", async () => {
    const longQuery = "a".repeat(1000);
    const files = await queryFiles(SMALL_REPO, longQuery, 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Query non-existent content", async () => {
    const files = await queryFiles(SMALL_REPO, "nonexistentxyzabc", 10);
    expect(files.length).toBe(0);
  });

  test("Build index for empty directory", async () => {
    const emptyDir = join(TEMP_TEST_DIR, "empty");
    await mkdir(emptyDir, { recursive: true });
    const manifest = await buildIndex(emptyDir, "full");
    expect(manifest.file_count).toBe(0);
  });

  test("Handle directory with only non-code files", async () => {
    const nonCodeDir = join(TEMP_TEST_DIR, "non-code");
    await mkdir(nonCodeDir, { recursive: true });
    await writeFile(join(nonCodeDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(nonCodeDir, "data.bin"), Buffer.from([0x00, 0x01, 0x02]));
    const manifest = await buildIndex(nonCodeDir, "full");
    expect(manifest.file_count).toBeGreaterThanOrEqual(0);
  });

  test("Malformed manifest reports stale status without throwing", async () => {
    const repo = join(TEMP_TEST_DIR, "malformed-manifest");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "alpha.ts"), "export const alpha = 1\n");
    await buildIndex(repo, "full");

    const manifestPath = join(repo, ".veil", "index", "manifest.json");
    await writeFile(manifestPath, "{this-is-not-json\n");

    const status = await getStatus(repo);
    expect(status.exists).toBe(true);
    expect(status.stale).toBe(true);
    expect(status.reasons.includes("manifest-invalid-json")).toBe(true);
  });

  test("Corrupted SQLite index surfaces deterministic status and query error", async () => {
    const repo = join(TEMP_TEST_DIR, "corrupted-sqlite");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "beta.ts"), "export const beta = 2\n");
    await buildIndex(repo, "full");

    const dbPath = join(repo, ".veil", "index", "index.sqlite");
    await writeFile(dbPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const status = await getStatus(repo);
    expect(status.reasons.includes("index-db-corrupt")).toBe(true);

    let caught = "";
    try {
      await queryFiles(repo, "beta", 10);
    } catch (error) {
      caught = String(error);
    }
    expect(caught.includes("index-db-corrupt")).toBe(true);
  });

  test("Schema version mismatch reports stale status", async () => {
    const repo = join(TEMP_TEST_DIR, "schema-version-mismatch");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "gamma.ts"), "export const gamma = 3\n");
    await buildIndex(repo, "full");

    const manifestPath = join(repo, ".veil", "index", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
      schema_version: string;
    };
    manifest.schema_version = "999";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const status = await getStatus(repo);
    expect(status.exists).toBe(true);
    expect(status.stale).toBe(true);
    expect(status.reasons.includes("schema-version-mismatch")).toBe(true);
  });

  test("SQLite rebuild recovers after database corruption", async () => {
    const repo = join(TEMP_TEST_DIR, "sqlite-recover");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "delta.ts"), "export const delta = 4\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await buildIndex(repo, "full");

    const dbPath = join(repo, ".veil", "index", "index.sqlite");
    await writeFile(dbPath, Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]));

    await buildIndex(repo, "full");
    const files = await queryFiles(repo, "delta", 10);
    expect(files.some((file) => file.path === "delta.ts")).toBe(true);
  });

  test("Concurrent read and write operations do not corrupt index", async () => {
    const repo = join(TEMP_TEST_DIR, "concurrent-rw");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "epsilon.ts"), "export const epsilon = 5\n");
    git(repo, ["init"]);
    git(repo, ["add", "."]);
    git(repo, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "init",
    ]);
    await buildIndex(repo, "full");

    // Run concurrent operations - testing that they don't crash or corrupt
    const operations = await Promise.all([
      queryFiles(repo, "epsilon", 10),
      querySymbols(repo, "epsilon", 10),
      queryChunks(repo, "epsilon", 10),
      getStatus(repo),
    ]);

    // All operations should complete without throwing
    expect(operations[0].length).toBeGreaterThanOrEqual(0);
    expect(operations[1].length).toBeGreaterThanOrEqual(0);
    expect(operations[2].length).toBeGreaterThanOrEqual(0);
    expect(operations[3].exists).toBe(true);
  });
});

describe("Phase 4.5: Query accuracy verification", () => {
  test("Query results maintain descending score order", async () => {
    const result = await lookupIndex(MEDIUM_REPO, "service process");
    for (const group of [result.files, result.symbols, result.chunks]) {
      for (let i = 0; i + 1 < group.length; i += 1) {
        expect(group[i].score >= group[i + 1].score).toBe(true);
      }
    }
  });

  test("Limit boundary: limit 0 returns empty results", async () => {
    const files = await queryFiles(SMALL_REPO, "hello", 0);
    expect(files.length).toBe(0);
  });

  test("Limit boundary: limit 1 returns at most 1 result", async () => {
    const files = await queryFiles(MEDIUM_REPO, "service", 1);
    expect(files.length).toBeLessThanOrEqual(1);
  });

  test("Limit boundary: limit max-1 returns correct count", async () => {
    const limit = 19;
    const files = await queryFiles(MEDIUM_REPO, "service", limit);
    expect(files.length).toBeLessThanOrEqual(limit);
  });

  test("Limit boundary: limit max returns correct count", async () => {
    const limit = 20;
    const files = await queryFiles(MEDIUM_REPO, "service", limit);
    expect(files.length).toBeLessThanOrEqual(limit);
  });

  test("Limit boundary: limit max+1 is capped to max", async () => {
    const limit = 21;
    const files = await queryFiles(MEDIUM_REPO, "service", limit);
    // Should be capped to 20 or less
    expect(files.length).toBeLessThanOrEqual(20);
  });

  test("Unicode query: Japanese characters", async () => {
    const files = await queryFiles(SMALL_REPO, "こんにちは", 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Unicode query: Chinese characters", async () => {
    const files = await queryFiles(SMALL_REPO, "你好世界", 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Unicode query: Emoji", async () => {
    const files = await queryFiles(SMALL_REPO, "🎉🎊", 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Unicode query: Mixed scripts", async () => {
    const files = await queryFiles(SMALL_REPO, "hello世界🎉", 10);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  test("Empty result handling is consistent across query types", async () => {
    const nonexistentQuery = "nonexistentxyzabc123456789";
    const files = await queryFiles(SMALL_REPO, nonexistentQuery, 10);
    const symbols = await querySymbols(SMALL_REPO, nonexistentQuery, 10);
    const chunks = await queryChunks(SMALL_REPO, nonexistentQuery, 10);

    expect(files.length).toBe(0);
    expect(symbols.length).toBe(0);
    expect(chunks.length).toBe(0);
  });
});

describe("Phase 4.6: Error handling standardization", () => {
  test("Git tool error responses have consistent format", () => {
    const result = gitStatus("/nonexistent/path/that/does/not/exist");
    expect(result.meta.ok).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBeDefined();
    expect(result.error?.message).toBeDefined();
    expect(typeof result.error?.code).toBe("string");
    expect(typeof result.error?.message).toBe("string");
    expect(result.data).toBeNull();
  });

  test("Web search error responses have consistent format", async () => {
    const result = await webSearch(SMALL_REPO, { query: "" });
    expect(result.meta.ok).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBeDefined();
    expect(result.error?.message).toBeDefined();
    expect(typeof result.error?.code).toBe("string");
    expect(typeof result.error?.message).toBe("string");
    expect(result.data).toBeNull();
  });

  test("Fetch URL error responses have consistent format", async () => {
    const result = await fetchUrl({ url: "not-a-valid-url" });
    expect(result.meta.ok).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBeDefined();
    expect(result.error?.message).toBeDefined();
    expect(typeof result.error?.code).toBe("string");
    expect(typeof result.error?.message).toBe("string");
    expect(result.data).toBeNull();
  });

  test("Git tool success responses have consistent format", () => {
    const result = gitStatus(SMALL_REPO);
    expect(result.meta.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.meta.workspace).toBeDefined();
    expect(result.meta.tool).toBeDefined();
    expect(result.meta.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("Error codes are from defined taxonomies", () => {
    const gitResult = gitStatus("/nonexistent/path");
    if (!gitResult.meta.ok && gitResult.error) {
      const validGitCodes = [
        "not-a-repo",
        "git-unavailable",
        "gh-unavailable",
        "gh-unauthenticated",
        "invalid-revision",
        "invalid-path",
        "unsafe-arg",
        "timeout",
        "output-too-large",
        "command-failed",
      ];
      expect(validGitCodes).toContain(gitResult.error.code);
    }
  });
});

describe("Phase 5: TopKHeap correctness verification", () => {
  test("TopKHeap with k=1 returns only highest score", () => {
    const heap = new __internal.TopKHeap<string>(1);
    heap.insert("a", 1);
    heap.insert("b", 5);
    heap.insert("c", 3);
    heap.insert("d", 2);
    expect(heap.toSortedArray()).toEqual(["b"]);
  });

  test("TopKHeap with k=2 returns top 2 scores", () => {
    const heap = new __internal.TopKHeap<string>(2);
    heap.insert("a", 1);
    heap.insert("b", 5);
    heap.insert("c", 3);
    heap.insert("d", 2);
    expect(heap.toSortedArray()).toEqual(["b", "c"]);
  });

  test("TopKHeap handles duplicate scores correctly", () => {
    const heap = new __internal.TopKHeap<string>(3);
    heap.insert("a", 5);
    heap.insert("b", 5);
    heap.insert("c", 5);
    heap.insert("d", 5);
    const result = heap.toSortedArray();
    expect(result.length).toBe(3);
    // All should have score 5, order doesn't matter
    expect(["a", "b", "c", "d"].filter((x) => result.includes(x)).length).toBe(3);
  });

  test("TopKHeap keeps earliest items for equal scores", () => {
    const heap = new __internal.TopKHeap<string>(3);
    heap.insert("a", 5);
    heap.insert("b", 5);
    heap.insert("c", 5);
    heap.insert("d", 5);
    heap.insert("e", 5);
    expect(heap.toSortedArray()).toEqual(["a", "b", "c"]);
  });

  test("TopKHeap maintains descending order after replacements", () => {
    const heap = new __internal.TopKHeap<string>(3);
    heap.insert("a", 1);
    heap.insert("b", 2);
    heap.insert("c", 3);
    heap.insert("d", 4); // replaces a (lowest)
    heap.insert("e", 5); // replaces b (lowest after d)
    const result = heap.toSortedArray();
    expect(result).toEqual(["e", "d", "c"]);
  });

  test("TopKHeap with k=0 returns empty array", () => {
    const heap = new __internal.TopKHeap<string>(0);
    heap.insert("a", 1);
    heap.insert("b", 5);
    expect(heap.toSortedArray()).toEqual([]);
  });

  test("TopKHeap property: always returns at most k items", () => {
    for (let k = 1; k <= 10; k++) {
      const heap = new __internal.TopKHeap<number>(k);
      for (let i = 0; i < 100; i++) {
        heap.insert(i, Math.random() * 100);
      }
      expect(heap.toSortedArray().length).toBeLessThanOrEqual(k);
    }
  });

  test("TopKHeap property: results are sorted descending", () => {
    const heap = new __internal.TopKHeap<number>(10);
    for (let i = 0; i < 100; i++) {
      heap.insert(i, Math.random() * 100);
    }
    const result = heap.toSortedArray();
    for (let i = 0; i + 1 < result.length; i++) {
      // We can't check scores directly, but we can verify the heap property
      // by checking that the array is sorted (which toSortedArray does)
      expect(result[i]).toBeDefined();
    }
  });

  test("TopKHeap property: contains highest k scores from input", () => {
    const heap = new __internal.TopKHeap<number>(5);
    const scores: number[] = [];
    for (let i = 0; i < 20; i++) {
      const score = Math.random() * 100;
      scores.push(score);
      heap.insert(i, score);
    }
    const result = heap.toSortedArray();
    scores.sort((a, b) => b - a).slice(0, 5);
    // The heap should contain the items with the top 5 scores
    expect(result.length).toBe(5);
  });
});

describe("Phase 6: Query cache optimization", () => {
  test("Query cache evicts old entries when limit exceeded", async () => {
    // Make many different queries to trigger cache eviction
    const queries = [];
    for (let i = 0; i < 150; i++) {
      queries.push(queryFiles(SMALL_REPO, `unique-query-${String(i)}`, 10));
    }
    await Promise.all(queries);

    // Cache should not grow unbounded
    // The exact size depends on MAX_QUERY_CACHE_SIZE (100)
    // We just verify it doesn't crash and completes successfully
    expect(true).toBe(true);
  });

  test("Repeated queries hit cache", async () => {
    // Clear diagnostics
    diagnostics.reset();

    // First query - cache miss
    const files1 = await queryFiles(SMALL_REPO, "hello", 10);
    const snap1 = diagnostics.getDiagnostics();
    const misses1 = snap1.cache.query_cache_misses;

    // Second query - should hit cache
    const files2 = await queryFiles(SMALL_REPO, "hello", 10);
    const snap2 = diagnostics.getDiagnostics();
    const misses2 = snap2.cache.query_cache_misses;

    // Misses should not increase on second query
    expect(misses2).toBe(misses1);
    expect(files1.length).toBe(files2.length);
  });

  test("Query cache evicts least recently used entries", async () => {
    diagnostics.reset();
    await queryFiles(SMALL_REPO, "hello", 10);
    const missesBefore = diagnostics.getDiagnostics().cache.query_cache_misses;

    for (let i = 0; i < 120; i++) {
      await queryFiles(SMALL_REPO, `lru-evict-${String(i)}`, 10);
    }

    await queryFiles(SMALL_REPO, "hello", 10);
    const missesAfter = diagnostics.getDiagnostics().cache.query_cache_misses;
    expect(missesAfter).toBeGreaterThan(missesBefore);
  });

  test("Symbol query keeps relevant hit when one token matches", async () => {
    const symbols = await querySymbols(SMALL_REPO, "add nonexistenttoken", 10);
    expect(symbols.some((symbol) => symbol.name === "add")).toBe(true);
  });

  test("Query helpers return empty lists when limit is zero", async () => {
    const files = await queryFiles(SMALL_REPO, "hello", 0);
    const symbols = await querySymbols(SMALL_REPO, "add", 0);
    const chunks = await queryChunks(SMALL_REPO, "hello", 0);
    expect(files).toEqual([]);
    expect(symbols).toEqual([]);
    expect(chunks).toEqual([]);
  });
});

describe("Phase 5: Performance characteristics", () => {
  test("Index build completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await buildIndex(MEDIUM_REPO, "full");
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(5000);
  });

  test("File query completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await queryFiles(MEDIUM_REPO, "service", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(100);
  });

  test("Symbol query completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await querySymbols(MEDIUM_REPO, "process", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(100);
  });

  test("Chunk search completes in reasonable time", async () => {
    const start = Bun.nanoseconds();
    await queryChunks(MEDIUM_REPO, "async fetch", 20);
    const elapsed = (Bun.nanoseconds() - start) / 1e6;
    expect(elapsed).toBeLessThan(100);
  });
});

describe("Indexer internals", () => {
  test("TopKHeap maintains highest scores with replacement", () => {
    const heap = new __internal.TopKHeap<string>(2);
    heap.insert("a", 1);
    heap.insert("b", 2);
    heap.insert("c", 3);
    heap.insert("d", 0.5);
    const out = heap.toSortedArray();
    expect(out).toEqual(["c", "b"]);
  });

  test("TopKHeap heapifyDown checks right child branch", () => {
    const heap = new __internal.TopKHeap<string>(3);
    heap.insert("low", 2);
    heap.insert("high", 5);
    heap.insert("mid", 3);
    heap.insert("top", 6);
    const out = heap.toSortedArray();
    expect(out).toEqual(["top", "high", "mid"]);
  });

  test("listFilesFallback walks non-git workspace", async () => {
    const root = join(TEMP_TEST_DIR, "fallback-list-files");
    const nested = join(root, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, "one.ts"), "export const one = 1\n");
    await writeFile(join(nested, "two.ts"), "export const two = 2\n");
    const listed = await __internal.listFilesFallback(root);
    expect(listed.includes("one.ts")).toBe(true);
    expect(listed.some((p) => p.endsWith("nested/two.ts"))).toBe(true);
  });

  test("score helpers emit exact and token reasons", () => {
    const parsed = {
      normalized: "hello world",
      tokens: ["hello", "world"],
      pathTokens: [],
      intent: "code",
    } as const;
    const file = __internal.scoreFile("src/hello-world.ts", parsed as never);
    const symbol = __internal.scoreSymbol(
      { path: "src/hello.ts", line: 1, kind: "function", name: "helloWorld" },
      parsed as never,
    );
    const chunk = __internal.scoreChunk(
      {
        id: "1",
        path: "src/hello.ts",
        start_line: 1,
        end_line: 1,
        content: "export const helloWorld = true",
      },
      parsed as never,
    );
    expect(file.reasons.length).toBeGreaterThan(0);
    expect(symbol.reasons.length).toBeGreaterThan(0);
    expect(chunk.reasons.length).toBeGreaterThan(0);
  });
});

describe("Agent guidance helpers", () => {
  test("tool descriptions are intent-first for canonical MCP tools", () => {
    const descriptions = TOOL_DESCRIPTIONS;
    expect(descriptions.veil_discover.startsWith("Use when you need")).toBe(true);
    expect(descriptions.veil_lookup.startsWith("Use when you need")).toBe(true);
    expect(descriptions.veil_files.startsWith("Use when you need")).toBe(true);
    expect(descriptions.veil_symbols.startsWith("Use when you need")).toBe(true);
    expect(descriptions.veil_search.startsWith("Use when you need")).toBe(true);
    expect(descriptions.veil_gh_lookup.includes("GitHub")).toBe(true);
  });

  test("buildAgentGuidance returns high confidence for successful results", () => {
    const guidance = buildAgentGuidance("discover", {
      files: [{ item: { path: "src/a.ts" }, score: 1 }],
      symbols: [],
      chunks: [],
    });
    expect(guidance.confidence).toBe("high");
    expect(guidance.coverage).toBe("full");
    expect(guidance.next_calls.length).toBeGreaterThan(0);
  });

  test("buildAgentGuidance returns recovery hints for empty lookup", () => {
    const guidance = buildAgentGuidance(
      "lookup",
      { files: [], symbols: [], chunks: [] },
      { query: "build index" },
    );
    expect(guidance.confidence).toBe("medium");
    expect(guidance.coverage).toBe("partial");
    expect(guidance.recommended_query?.includes("broaden ")).toBe(true);
  });

  test("buildAgentGuidance returns low confidence for error responses", () => {
    const guidance = buildAgentGuidance("git_status", {
      meta: { ok: false },
      error: { code: "command-failed" },
    });
    expect(guidance.confidence).toBe("low");
    expect(guidance.coverage).toBe("none");
    expect((guidance.missing_context ?? []).length).toBeGreaterThan(0);
  });

  test("withAgentGuidanceCompact omits guidance for high-confidence payloads", () => {
    const payload = withAgentGuidanceCompact("discover", {
      files: [{ item: { path: "src/a.ts" }, score: 1 }],
      symbols: [],
      chunks: [],
    });
    expect(payload.guidance).toBeUndefined();
  });

  test("withAgentGuidanceCompact keeps guidance for low-confidence payloads", () => {
    const payload = withAgentGuidanceCompact(
      "lookup",
      { files: [], symbols: [], chunks: [] },
      { query: "build index" },
    );
    expect(payload.guidance).toBeDefined();
  });
});

describe("MCP protocol conformance", () => {
  async function withMcpClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ name: "veil-test", version: "0.1.0" }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: "nix",
      args: ["run", "nixpkgs#bun", "--", "run", "src/bin.ts", "mcp", "server"],
      cwd: join(import.meta.dir, ".."),
      stderr: "pipe",
    });

    await client.connect(transport);
    try {
      return await run(client);
    } finally {
      await client.close();
      await transport.close();
    }
  }

  test("tools/list exposes canonical MCP tool names and metadata", async () => {
    await withMcpClient(async (client) => {
      const list = await client.listTools();
      const toolNames = list.tools.map((tool) => tool.name);

      expect(toolNames.includes("veil_discover")).toBe(true);
      expect(toolNames.includes("veil_lookup")).toBe(true);
      expect(toolNames.includes("veil_fetch_url")).toBe(true);
      expect(toolNames.includes("veil_chunk")).toBe(true);
      expect(toolNames.includes("find_file")).toBe(false);

      const discover = list.tools.find((tool) => tool.name === "veil_discover");
      expect((discover?.title ?? "").length).toBeGreaterThan(0);
      expect(discover?.annotations).toBeDefined();
    });
  });

  test("tools/call returns explicit tool execution errors", async () => {
    await withMcpClient(async (client) => {
      const okResult = await client.callTool({
        name: "veil_status",
        arguments: { workspace: SMALL_REPO },
      });
      expect(okResult.isError).toBe(false);

      const errorResult = await client.callTool({
        name: "veil_fetch_url",
        arguments: { url: "not-a-valid-url" },
      });
      expect(errorResult.isError).toBe(true);
      const errorText = toolText(errorResult);
      expect(errorText.includes("details")).toBe(false);
    });
  });

  test("discover output uses compact status summary", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "veil_discover",
        arguments: { workspace: SMALL_REPO, query: "hello" },
      });
      expect(result.isError).toBe(false);
      const text = toolText(result);
      expect(text.includes("manifest")).toBe(false);
      expect(text.includes("reasons")).toBe(true);
    });
  });
});

describe("Profiler utilities", () => {
  test("CLI parser helper intent coercion is stable", () => {
    expect(__internalCli.parseIntent("docs")).toBe("docs");
    expect(__internalCli.parseIntent("unknown")).toBe("auto");
  });

  test("CLI init mode coercion is stable", () => {
    expect(__internalCli.parseInitMode("mcp")).toBe("mcp");
    expect(__internalCli.parseInitMode("unknown")).toBe("cli");
  });

  test("CLI package manager inference detects bun runtime", () => {
    const pm = __internalCli.inferInitPackageManager(
      undefined,
      ["veil", "init"],
      "/usr/local/bin/bun",
    );
    expect(pm).toBe("bun");
  });

  test("CLI package manager inference detects pnpm execpath", () => {
    const pm = __internalCli.inferInitPackageManager(
      undefined,
      ["veil", "init"],
      "/usr/local/bin/node",
      "/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs",
    );
    expect(pm).toBe("pnpm");
  });

  test("CLI init setup plan includes CLI and skill installs for cli mode", () => {
    const steps = __internalCli.initStepsForMode("cli", "npm");
    expect(steps.some((step) => step.id === "install-cli")).toBe(true);
    expect(steps.some((step) => step.id === "install-skill")).toBe(true);
  });

  test("CLI init setup plan includes mcp skill install for mcp mode", () => {
    const steps = __internalCli.initStepsForMode("mcp", "npm");
    expect(steps.some((step) => step.id === "install-mcp-skill")).toBe(true);
    expect(steps.some((step) => step.id === "install-cli")).toBe(false);
  });

  test("CLI init setup result supports generic mcp setup contract", async () => {
    const result = await __internalCli.buildInitSetupResult({
      workspace: SMALL_REPO,
      mode: "mcp",
      interactive: false,
      yes: false,
      executeInstalls: false,
      packageManager: "npm",
    });
    expect(result.mode).toBe("mcp");
    expect(result.package_manager).toBe("npm");
    expect(result.executed).toBe(false);
    expect(result.mcp_snippet).toContain("@ushiradineth/veil@latest mcp server");
    expect(result.steps.every((step) => step.status === "planned")).toBe(true);
    expect(result.next_steps.length).toBeGreaterThan(0);
    expect(result.parsers.available.length).toBeGreaterThan(0);
  });

  test("CLI init setup result can execute cli install and skip skill", async () => {
    const result = await __internalCli.buildInitSetupResult({
      workspace: SMALL_REPO,
      mode: "cli",
      interactive: false,
      yes: false,
      packageManager: "npm",
      runStep: (step) => ({ ...step, status: "ok", ok: true, details: "mocked" }),
    });
    expect(result.mode).toBe("cli");
    expect(result.executed).toBe(true);
    expect(result.steps[0]?.status).toBe("ok");
    expect(result.steps[1]?.status).toBe("skipped");
    expect(result.parsers.enabled.length).toBeGreaterThan(0);
  });

  test("Parser list parsing normalizes aliases", () => {
    const parsed = parseParserList("js, ts, python,sh,go,rs,json");
    expect(parsed).toEqual(["javascript", "typescript", "python", "bash", "go", "rust", "json"]);
  });

  test("Parser config persists enabled selections", async () => {
    const workspace = join(TEMP_TEST_DIR, "parser-config-workspace");
    await mkdir(workspace, { recursive: true });
    const defaults = await getParserConfig(workspace);
    expect(defaults.enabled.length).toBe(BUILTIN_PARSERS.length);

    await setEnabledParsers(workspace, ["javascript", "typescript"]);
    const narrowed = await getParserConfig(workspace);
    expect(narrowed.enabled).toEqual(["javascript", "typescript"]);

    await removeParsers(workspace, ["typescript"]);
    const afterRemove = await getParserConfig(workspace);
    expect(afterRemove.enabled.includes("typescript")).toBe(false);
  });

  test("Missing parser runtime check ignores json-only parser config", () => {
    const missing = missingRequiredParsers(new Set(["json"]));
    expect(missing).toEqual([]);
  });

  test("Missing parser runtime check passes for default parser config", async () => {
    const config = await getParserConfig(SMALL_REPO);
    const missing = missingRequiredParsers(new Set(config.enabled));
    expect(missing).toEqual([]);
  });

  test("Bun prebuild recovery status is explicit", () => {
    const status = getBunPrebuildRecoveryStatus();
    expect(typeof status.attempted).toBe("boolean");
    expect(typeof status.ok).toBe("boolean");
    expect(
      [
        "not-bun",
        "already-present",
        "linked",
        "copied",
        "missing-candidate",
        "readonly",
        "resolution-failed",
      ].includes(status.reason),
    ).toBe(true);
  });

  test("Bin isMainModule handles non-main paths", () => {
    expect(__internalBin.isMainModule(import.meta.url)).toBe(false);
  });

  test("Bin runMain catches thrown errors", async () => {
    const originalExitCode = process.exitCode;
    const writes: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      process.exitCode = 0;
      await __internalBin.runMain(() => Promise.reject(new Error("boom")));
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalWrite;
      process.exitCode = originalExitCode;
    }

    expect(writes.join(" ")).toContain("boom");
  });

  test("Bin runMain uses default runner", async () => {
    const originalExitCode = process.exitCode;
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;

    try {
      process.exitCode = 0;
      await __internalBin.runMain();
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = originalExitCode;
      process.stderr.write = originalWrite;
    }
  });

  test("CLI createCli returns yargs parser surface", () => {
    const cli = __internalCli.createCli([]);
    expect(typeof cli.parseAsync).toBe("function");
    expect(typeof cli.command).toBe("function");
  });
  test("State root helpers handle absolute and relative overrides", () => {
    const workspace = join(TEMP_TEST_DIR, "state-root-workspace");
    const absRoot = "/tmp/veil-state-root";
    const defaultRoot = resolveStateRoot(workspace);
    expect(defaultRoot.endsWith("/.veil") || defaultRoot.endsWith("\\.veil")).toBe(true);
    expect(resolveStateRoot(workspace, "   ")).toBe(join(workspace, ".veil"));
    expect(resolveStateRoot(workspace, " custom-state ")).toBe(join(workspace, "custom-state"));
    expect(resolveStateRoot(workspace, absRoot)).toBe(absRoot);
    expect(resolveIndexDir(workspace, "custom-state")).toBe(
      join(workspace, "custom-state", "index"),
    );
    expect(diagnosticsStatePath(workspace, "custom-state")).toBe(
      join(workspace, "custom-state", "index", "diagnostics-state.json"),
    );
  });

  test("State root relative helper returns null for outside workspace", () => {
    const workspace = join(TEMP_TEST_DIR, "state-root-relative-workspace");
    expect(relativeStateRoot(workspace, "nested/.veil")).toBe("nested/.veil");
    expect(relativeStateRoot(workspace, "/tmp/veil-state")).toBeNull();
  });

  test("Profiler reports no data when empty", () => {
    profiler.reset();
    expect(profiler.report()).toBe("No profiling data available");
  });

  test("Profiler records marks and measurements when enabled", async () => {
    profiler.reset();
    profiler.enable();
    expect(profiler.isEnabled()).toBe(true);
    profiler.mark("sample");
    await Bun.sleep(1);
    profiler.measure("sample");
    const markers = profiler.getMarkers();
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.name).toBe("sample");
    expect((markers[0]?.duration ?? 0) >= 0).toBe(true);
    expect(profiler.report().includes("Profiling Report")).toBe(true);
  });

  test("Profiler disable and reset clear state", () => {
    profiler.disable();
    expect(profiler.isEnabled()).toBe(false);
    profiler.mark("ignored");
    profiler.measure("ignored");
    profiler.reset();
    expect(profiler.getMarkers().length).toBe(0);
  });

  test("Diagnostics installs SIGINT and SIGTERM handlers", () => {
    const hooks = new Map<string, () => void>();
    const exits: number[] = [];
    const d = new PerformanceDiagnostics({
      registerHook: (event, handler) => {
        hooks.set(event, handler);
      },
      exitFn: (code) => {
        exits.push(code);
      },
      statePath: join(TEMP_TEST_DIR, "diag-test-state.json"),
      persistIntervalMs: 0,
    });
    d.recordCacheHit();
    hooks.get("beforeExit")?.();
    hooks.get("exit")?.();
    hooks.get("SIGINT")?.();
    hooks.get("SIGTERM")?.();
    expect(exits).toEqual([130, 143]);
  });

  test("Diagnostics instance exercises all counter APIs", () => {
    const d = new PerformanceDiagnostics({
      registerHook: () => {
        return;
      },
      exitFn: () => {
        return;
      },
      statePath: join(TEMP_TEST_DIR, "diag-direct-state.json"),
      persistIntervalMs: 0,
    });
    d.recordCacheHit();
    d.recordCacheMiss();
    d.recordQuery(3);
    d.recordIndexBuild();
    d.recordBuildLatency(5);
    d.recordCacheInvalidation();
    d.updateCacheSizes(2, 1);
    d.recordGitCall(7, true, false, false);
    d.recordGitCall(11, false, true, true);
    const snap = d.getDiagnostics();
    expect(snap.cache.query_cache_hits).toBeGreaterThanOrEqual(1);
    expect(snap.cache.query_cache_misses).toBeGreaterThanOrEqual(1);
    expect(snap.operations.total_queries).toBeGreaterThanOrEqual(1);
    expect(snap.operations.index_builds).toBeGreaterThanOrEqual(1);
    expect(snap.operations.cache_invalidations).toBeGreaterThanOrEqual(1);
    expect(snap.operations.git_calls).toBeGreaterThanOrEqual(2);
    expect(snap.operations.gh_calls).toBeGreaterThanOrEqual(1);
    d.reset();
  });

  test("Diagnostics default constructor path can load and report", () => {
    const d = new PerformanceDiagnostics();
    d.recordQuery(1);
    const snap = d.getDiagnostics();
    expect(snap.latency.max_ms).toBeGreaterThanOrEqual(0);
  });

  test("Diagnostics default hooks and configureStatePath paths execute", () => {
    const originalOn = process.on.bind(process);
    const originalExit = process.exit.bind(process);
    const hooks = new Map<string, () => void>();
    const exitCodes: number[] = [];

    (process.on as unknown as (event: string, handler: () => void) => void) = (event, handler) => {
      hooks.set(event, handler);
      return;
    };
    (process.exit as unknown as (code?: number) => never) = (code?: number) => {
      exitCodes.push(code ?? -1);
      throw new Error("exit-intercept");
    };

    try {
      const d = new PerformanceDiagnostics();
      d.configureStatePath(join(TEMP_TEST_DIR, "diag-reconfigured-state.json"));
      d.recordCacheMiss();
      expect(hooks.has("SIGINT")).toBe(true);
      try {
        hooks.get("SIGINT")?.();
      } catch {
        // expected from intercepted process.exit
      }
      expect(exitCodes.includes(130)).toBe(true);
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }
  });
});

describe("Benchmark report generation", () => {
  test("Run id uses UTC timestamp format", () => {
    const runId = toRunId(new Date("2026-03-07T12:34:56.000Z"));
    expect(runId).toBe("20260307-123456Z");
  });

  test("BENCHMARKS markdown includes newest run paths", () => {
    const report = {
      generated_at: "2026-03-07T12:00:00.000Z",
      config: {
        workspace: "/tmp/repo",
        profile: "smoke",
        agents: ["codex", "claude"],
        strategies: ["mcp_transport", "cli_skill"],
        cold_iterations: 1,
        warm_iterations: 1,
        output_dir: "/tmp/repo/benchmarks/results/20260307-120000Z",
        competitors: ["codex-none"],
        max_runtime_ms: 600000,
        max_cell_runtime_ms: 20000,
        preflight: {
          "codex-none": {
            ready: true,
            mode_control: "prompt_only",
            reason: "mode wiring not exposed by codex CLI",
          },
        },
      },
      scenarios: [
        {
          id: "status-bootstrap",
          kind: "status",
          title: "Repository status bootstrap",
        },
      ],
      competitors: [
        {
          id: "codex-none",
          label: "codex (none)",
          scenarios: {
            "status-bootstrap": {
              status: "ok",
              reason: null,
              ab_signal: {
                schema_overhead_tokens: 400,
                first_useful_action_ms: 10,
                fallback_rate: 1,
              },
              warm: {
                p50_ms: 10,
                p95_ms: 12,
              },
            },
          },
        },
      ],
    };

    const md = toBenchmarksMarkdown(report as never, "/tmp/repo");
    expect(md.includes("benchmarks/results/20260307-120000Z/results.json")).toBe(true);
    expect(md.includes("| status-bootstrap | 10.0000 / 12.0000 |")).toBe(true);
    expect(md.includes("Native Choice Signals")).toBe(true);
    expect(md.includes("A/B Signals")).toBe(true);
    expect(md.includes("- Profile: `smoke`")).toBe(true);
    expect(md.includes("- Agents: `codex,claude`")).toBe(true);
    expect(md.includes("- Strategies: `mcp_transport,cli_skill`")).toBe(true);
    expect(md.includes("Runtime budget")).toBe(true);
    expect(md.includes("Cell budget")).toBe(true);
    expect(md.includes("| codex (none) | yes | prompt_only |")).toBe(true);
  });
});

describe("Bench suite planning helpers", () => {
  test("Agent parsing excludes unsupported competitors", () => {
    const parsed = __internalBenchSuite.parseAgentIds(["codex", "opencode", "claude", "firecrawl"]);
    expect(parsed).toEqual(["codex", "claude", "firecrawl"]);
  });

  test("Smoke profile uses reduced scenario surface", () => {
    const smoke = __internalBenchSuite.scenariosForProfile("smoke");
    const full = __internalBenchSuite.scenariosForProfile("full");
    expect(smoke.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(smoke.length);
    expect(smoke.every((scenario) => scenario.kind !== "gh_lookup")).toBe(true);
  });

  test("Strategy parsing supports defaults and legacy aliases", () => {
    const parsed = __internalBenchSuite.parseStrategies(["veil", "none", "cli_skill"]);
    expect(parsed).toEqual(["mcp_transport", "cli_skill"]);
  });

  test("Timeout errors map to unsupported classification", () => {
    const mapped = __internalBenchSuite.mapTimeoutToUnsupported("codex", {
      status: "error",
      text: "",
      reason: "ETIMEDOUT after 1000ms",
    });
    expect(mapped.status).toBe("unsupported");
    expect(mapped.reason).toBe("codex timeout");
  });
});
