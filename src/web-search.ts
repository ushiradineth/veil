import type { WebSearchDebugResult, WebSearchProvider, WebSearchProviderTrace, WebSearchResponse, WebSearchResult } from "./types";

type DuckTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: DuckTopic[];
};

type DuckResponse = {
  RelatedTopics?: DuckTopic[];
};

type GithubRepo = {
  full_name?: string;
  html_url?: string;
  description?: string | null;
};

type GithubResponse = {
  items?: GithubRepo[];
};

type RedditPost = {
  title?: string;
  permalink?: string;
  selftext?: string;
  url?: string;
};

type RedditResponse = {
  data?: {
    children?: Array<{ data?: RedditPost }>;
  };
};

type ProviderRawResult = {
  title: string;
  url: string;
  snippet: string;
};

type ProviderOutcome = {
  provider: WebSearchProvider;
  ok: boolean;
  duration_ms: number;
  results: ProviderRawResult[];
  warning: string | null;
};

type ProviderDef = {
  provider: WebSearchProvider;
  run: (fetchImpl: typeof fetch, query: string, limit: number, signal: AbortSignal) => Promise<ProviderRawResult[]>;
};

type ScoredResult = {
  provider: WebSearchProvider;
  title: string;
  url: string;
  snippet: string;
  score: number;
  reasons: Array<{ label: string; detail: string }>;
};

const PROVIDER_ORDER: WebSearchProvider[] = ["google", "duckduckgo", "wikipedia", "github", "reddit", "deepwiki"];

const PROVIDER_BASE_SCORE: Record<WebSearchProvider, number> = {
  google: 10,
  duckduckgo: 9,
  wikipedia: 6,
  github: 7,
  reddit: 5,
  deepwiki: 8,
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
]);

function nowMs(): number {
  if (typeof Bun !== "undefined" && typeof Bun.nanoseconds === "function") {
    return Number(Bun.nanoseconds()) / 1_000_000;
  }
  return Date.now();
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeUrl(raw: string): string {
  const trimmed = cleanText(raw);
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const kept: Array<[string, string]> = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        kept.push([key, value]);
      }
    }
    kept.sort(([aKey, aValue], [bKey, bValue]) => {
      const keyCmp = aKey.localeCompare(bKey);
      if (keyCmp !== 0) return keyCmp;
      return aValue.localeCompare(bValue);
    });
    const query = kept
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    let path = parsed.pathname || "/";
    if (path.length > 1) {
      path = path.replace(/\/+$/, "");
    }
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${path}${query ? `?${query}` : ""}`;
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

function resolveResultUrl(raw: string): string {
  const trimmed = cleanText(decodeHtml(raw));
  if (!trimmed) return "";

  const withScheme = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  try {
    const parsed = new URL(withScheme);
    if (parsed.host.includes("duckduckgo.com") && parsed.pathname === "/l/") {
      const redirected = parsed.searchParams.get("uddg");
      if (redirected) {
        return cleanText(decodeURIComponent(redirected));
      }
    }
    return withScheme;
  } catch {
    return withScheme;
  }
}

function resultDomain(rawUrl: string): string {
  try {
    const parsed = new URL(resolveResultUrl(rawUrl));
    return parsed.host.toLowerCase();
  } catch {
    return "";
  }
}

function scoreFor(provider: WebSearchProvider, rank: number): number {
  return Number((PROVIDER_BASE_SCORE[provider] - rank * 0.01).toFixed(4));
}

function queryTerms(query: string): string[] {
  const stopWords = new Set(["a", "an", "the", "to", "from", "for", "of", "in", "on", "with", "how", "do", "i"]);
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
  return Array.from(new Set(tokens));
}

function relevanceScore(query: string, row: ProviderRawResult): number {
  const terms = queryTerms(query);
  if (terms.length === 0) return 0;

  const queryText = query.toLowerCase();
  const title = row.title.toLowerCase();
  const snippet = row.snippet.toLowerCase();
  const url = row.url.toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 6;
    if (snippet.includes(term)) score += 3;
    if (url.includes(term)) score += 1;
  }
  if (title.includes(queryText)) score += 8;
  if (snippet.includes(queryText)) score += 4;
  return score;
}

function parseGoogleResults(html: string, limit: number): ProviderRawResult[] {
  const rows: ProviderRawResult[] = [];
  const pattern = /<a href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let match = pattern.exec(html);
  while (match && rows.length < limit) {
    const rawUrl = cleanText(decodeURIComponent(decodeHtml(match[1] ?? "")));
    if (!rawUrl || rawUrl.includes("webcache.googleusercontent.com")) {
      match = pattern.exec(html);
      continue;
    }
    const body = match[2] ?? "";
    const titleMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(body);
    const title = cleanText(decodeHtml(stripTags(titleMatch?.[1] ?? "")));
    if (!title) {
      match = pattern.exec(html);
      continue;
    }
    rows.push({
      title,
      url: rawUrl,
      snippet: "",
    });
    match = pattern.exec(html);
  }
  return rows;
}

function flattenTopics(topics: DuckTopic[] | undefined): DuckTopic[] {
  if (!topics) return [];
  const out: DuckTopic[] = [];
  for (const topic of topics) {
    if (Array.isArray(topic.Topics) && topic.Topics.length > 0) {
      out.push(...flattenTopics(topic.Topics));
      continue;
    }
    out.push(topic);
  }
  return out;
}

function parseDuckResults(payload: DuckResponse, limit: number): ProviderRawResult[] {
  const out: ProviderRawResult[] = [];
  const topics = flattenTopics(payload.RelatedTopics);
  for (const topic of topics) {
    const text = cleanText(topic.Text ?? "");
    const url = cleanText(topic.FirstURL ?? "");
    if (!text || !url) continue;
    out.push({
      title: text.split(" - ")[0] ?? text,
      url,
      snippet: text,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseDuckHtmlResults(html: string, limit: number): ProviderRawResult[] {
  const out: ProviderRawResult[] = [];
  const pattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match = pattern.exec(html);

  while (match && out.length < limit) {
    const url = resolveResultUrl(match[1] ?? "");
    const title = cleanText(decodeHtml(stripTags(match[2] ?? "")));
    if (!url || !title) {
      match = pattern.exec(html);
      continue;
    }
    out.push({ title, url, snippet: "" });
    match = pattern.exec(html);
  }

  return out;
}

function parseDeepwikiResults(html: string, limit: number): ProviderRawResult[] {
  const out: ProviderRawResult[] = [];
  const pattern = /<a[^>]*class="[^\"]*result__a[^\"]*"[^>]*href="([^\"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match = pattern.exec(html);

  while (match && out.length < limit) {
    const url = resolveResultUrl(match[1] ?? "");
    const title = cleanText(decodeHtml(stripTags(match[2] ?? "")));
    const normalized = normalizeUrl(url);
    if (!title || !normalized.includes("deepwiki.com/")) {
      match = pattern.exec(html);
      continue;
    }
    out.push({ title, url, snippet: "" });
    match = pattern.exec(html);
  }

  return out;
}

function parseWikipediaResults(payload: unknown, limit: number): ProviderRawResult[] {
  if (!Array.isArray(payload)) return [];
  const titles = Array.isArray(payload[1]) ? payload[1] : [];
  const snippets = Array.isArray(payload[2]) ? payload[2] : [];
  const urls = Array.isArray(payload[3]) ? payload[3] : [];
  const out: ProviderRawResult[] = [];
  for (let i = 0; i < titles.length; i += 1) {
    const title = cleanText(String(titles[i] ?? ""));
    const url = cleanText(String(urls[i] ?? ""));
    if (!title || !url) continue;
    out.push({
      title,
      url,
      snippet: cleanText(String(snippets[i] ?? "")),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseGithubResults(payload: GithubResponse, limit: number): ProviderRawResult[] {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const out: ProviderRawResult[] = [];
  for (const item of items) {
    const title = cleanText(item.full_name ?? "");
    const url = cleanText(item.html_url ?? "");
    if (!title || !url) continue;
    out.push({
      title,
      url,
      snippet: cleanText(item.description ?? ""),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseRedditResults(payload: RedditResponse, limit: number): ProviderRawResult[] {
  const children = Array.isArray(payload.data?.children) ? payload.data?.children ?? [] : [];
  const out: ProviderRawResult[] = [];
  for (const entry of children) {
    const post = entry.data;
    if (!post) continue;
    const title = cleanText(post.title ?? "");
    const permalink = cleanText(post.permalink ?? "");
    if (!title || !permalink) continue;
    const url = permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`;
    const snippet = cleanText(post.selftext ?? post.url ?? "");
    out.push({
      title,
      url,
      snippet,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("invalid-json");
  }
}

async function runProvider(
  def: ProviderDef,
  fetchImpl: typeof fetch,
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<ProviderOutcome> {
  const started = nowMs();
  try {
    const results = await def.run(fetchImpl, query, limit, signal);
    return {
      provider: def.provider,
      ok: results.length > 0,
      duration_ms: Number((nowMs() - started).toFixed(4)),
      results,
      warning: results.length > 0 ? null : "no-parseable-results",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeoutLike =
      signal.aborted || message === "timeout" || message.includes("AbortError") || message.toLowerCase().includes("aborted");
    return {
      provider: def.provider,
      ok: false,
      duration_ms: Number((nowMs() - started).toFixed(4)),
      results: [],
      warning: timeoutLike ? "timeout" : message,
    };
  }
}

function mergeOutcomes(
  outcomes: ProviderOutcome[],
  limit: number,
  query: string,
): { detailed_results: WebSearchDebugResult[]; primary_provider: WebSearchProvider } {
  const ordered = [...outcomes].sort(
    (a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider),
  );
  const deduped = new Map<string, ScoredResult>();

  for (const outcome of ordered) {
    for (let index = 0; index < outcome.results.length; index += 1) {
      const row = outcome.results[index];
      if (!row) continue;
      const normalized = normalizeUrl(row.url);
      if (!normalized) continue;
      const lexical = relevanceScore(query, row);
      const score = Number((lexical * 100 + scoreFor(outcome.provider, index + 1)).toFixed(4));
      const incoming: ScoredResult = {
        provider: outcome.provider,
        title: row.title,
        url: row.url,
        snippet: row.snippet,
        score,
        reasons: [{ label: `${outcome.provider}-rank`, detail: `Provider ${outcome.provider} rank ${index + 1}` }],
      };

      const existing = deduped.get(normalized);
      if (!existing) {
        deduped.set(normalized, incoming);
        continue;
      }

      if (incoming.score > existing.score) {
        incoming.reasons.push({ label: "dedupe", detail: `Duplicate URL also seen in ${existing.provider}` });
        deduped.set(normalized, incoming);
        continue;
      }

      existing.reasons.push({ label: "dedupe", detail: `Duplicate URL also seen in ${incoming.provider}` });
    }
  }

  const ranked = [...deduped.values()].sort((a, b) => {
      const scoreCmp = b.score - a.score;
      if (scoreCmp !== 0) return scoreCmp;
      const providerCmp = PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider);
      if (providerCmp !== 0) return providerCmp;
      return normalizeUrl(a.url).localeCompare(normalizeUrl(b.url));
    });

  const domainCounts = new Map<string, number>();
  const rows: ScoredResult[] = [];
  for (const row of ranked) {
    const domain = resultDomain(row.url);
    const count = domainCounts.get(domain) ?? 0;
    if (domain && count >= 2) {
      continue;
    }
    if (domain) {
      domainCounts.set(domain, count + 1);
    }
    rows.push(row);
    if (rows.length >= limit) {
      break;
    }
  }

  const primary_provider = rows[0]?.provider ?? ordered.find((item) => item.ok)?.provider ?? "google";

  return {
    primary_provider,
    detailed_results: rows.map((row) => ({
      title: row.title,
      url: row.url,
      snippet: row.snippet,
      score: row.score,
      reasons: row.reasons,
    })),
  };
}

const PROVIDERS: ProviderDef[] = [
  {
    provider: "google",
    run: async (fetchImpl, query, limit, signal) => {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=${limit}`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "text/html",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        signal,
      });
      if (response.ok) {
        const html = await response.text();
        const parsed = parseGoogleResults(html, limit);
        if (parsed.length > 0) {
          return parsed;
        }
      }

      const fallbackUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const fallbackResponse = await fetchImpl(fallbackUrl, {
        method: "GET",
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; veil-web-search)",
        },
        signal,
      });
      if (!fallbackResponse.ok) {
        throw new Error(`http-${response.status || fallbackResponse.status}`);
      }
      const fallbackHtml = await fallbackResponse.text();
      const fallbackParsed = parseDuckHtmlResults(fallbackHtml, limit);
      if (fallbackParsed.length > 0) {
        return fallbackParsed;
      }

      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
      const apiResponse = await fetchImpl(apiUrl, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      });
      if (!apiResponse.ok) {
        return [];
      }
      const payload = (await safeJson(apiResponse)) as DuckResponse;
      return parseDuckResults(payload, limit);
    },
  },
  {
    provider: "duckduckgo",
    run: async (fetchImpl, query, limit, signal) => {
      const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const htmlResponse = await fetchImpl(htmlUrl, {
        method: "GET",
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; veil-web-search)",
        },
        signal,
      });
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        const htmlResults = parseDuckHtmlResults(html, limit);
        if (htmlResults.length > 0) {
          return htmlResults;
        }
      }

      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
      const response = await fetchImpl(apiUrl, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) {
        throw new Error(`http-${response.status}`);
      }
      const payload = (await safeJson(response)) as DuckResponse;
      return parseDuckResults(payload, limit);
    },
  },
  {
    provider: "wikipedia",
    run: async (fetchImpl, query, limit, signal) => {
      const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json&origin=*`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) {
        throw new Error(`http-${response.status}`);
      }
      const payload = await safeJson(response);
      return parseWikipediaResults(payload, limit);
    },
  },
  {
    provider: "github",
    run: async (fetchImpl, query, limit, signal) => {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}&sort=stars&order=desc`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "veil-web-search",
        },
        signal,
      });
      if (!response.ok) {
        throw new Error(`http-${response.status}`);
      }
      const payload = (await safeJson(response)) as GithubResponse;
      return parseGithubResults(payload, limit);
    },
  },
  {
    provider: "reddit",
    run: async (fetchImpl, query, limit, signal) => {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance&type=link`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json", "user-agent": "veil-web-search" },
        signal,
      });
      if (!response.ok) {
        throw new Error(`http-${response.status}`);
      }
      const payload = (await safeJson(response)) as RedditResponse;
      return parseRedditResults(payload, limit);
    },
  },
  {
    provider: "deepwiki",
    run: async (fetchImpl, query, limit, signal) => {
      const scopedQuery = `site:deepwiki.com ${query}`;
      const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(scopedQuery)}`;
      const htmlResponse = await fetchImpl(htmlUrl, {
        method: "GET",
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; veil-web-search)",
        },
        signal,
      });
      if (!htmlResponse.ok) {
        throw new Error(`http-${htmlResponse.status}`);
      }

      const html = await htmlResponse.text();
      return parseDeepwikiResults(html, limit);
    },
  },
];

function traceForPending(provider: WebSearchProvider, durationMs: number, warning: string): WebSearchProviderTrace {
  return {
    provider,
    ok: false,
    duration_ms: Number(durationMs.toFixed(4)),
    result_count: 0,
    warning,
  };
}

export async function webSearch(
  workspace: string,
  options: { query: string; limit?: number; timeout_ms?: number; fetch_impl?: typeof fetch; debug?: boolean },
): Promise<WebSearchResponse> {
  const started = nowMs();
  const query = options.query.trim();
  const limit = Math.min(25, Math.max(1, options.limit ?? 8));
  const timeoutMs = Math.min(15_000, Math.max(300, options.timeout_ms ?? 5_000));
  const debug = options.debug ?? false;

  if (!query) {
    return {
      meta: {
        ok: false,
        duration_ms: Number((nowMs() - started).toFixed(4)),
      },
      data: null,
      error: { code: "invalid-query", message: "Query is required" },
    };
  }

  const abort = new AbortController();
  const budgetTimer = setTimeout(() => abort.abort("timeout"), timeoutMs);
  const fetchImpl = options.fetch_impl ?? fetch;
  let timedOut = false;

  try {
    const runs = PROVIDERS.map((def, idx) => runProvider(def, fetchImpl, query, limit, abort.signal).then((outcome) => ({ idx, outcome })));
    const pending = new Set(runs.map((_, idx) => idx));
    const outcomes: ProviderOutcome[] = [];

    while (pending.size > 0) {
      const elapsed = nowMs() - started;
      const remaining = timeoutMs - elapsed;
      if (remaining <= 0) {
        timedOut = true;
        break;
      }

      const candidates = [...pending].map((idx) => runs[idx]!);
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutSentinel = new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(null), remaining);
      });

      const settled = await Promise.race<{ idx: number; outcome: ProviderOutcome } | null>([
        ...candidates,
        timeoutSentinel,
      ]);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (!settled) {
        timedOut = true;
        break;
      }

      pending.delete(settled.idx);
      outcomes.push(settled.outcome);

    }

    if (pending.size > 0 && !abort.signal.aborted) {
      abort.abort("timeout");
    }

    const merge = mergeOutcomes(outcomes, limit, query);
    const traceByProvider = new Map<WebSearchProvider, WebSearchProviderTrace>();
    for (const outcome of outcomes) {
      traceByProvider.set(outcome.provider, {
        provider: outcome.provider,
        ok: outcome.ok,
        duration_ms: outcome.duration_ms,
        result_count: outcome.results.length,
        warning: outcome.warning,
      });
    }

    const elapsed = nowMs() - started;
    for (const idx of pending) {
      const provider = PROVIDER_ORDER[idx] ?? "google";
      traceByProvider.set(provider, traceForPending(provider, elapsed, timedOut ? "timeout" : "cancelled"));
    }

    const providerTrace = PROVIDER_ORDER.map((provider) =>
      traceByProvider.get(provider) ?? traceForPending(provider, elapsed, timedOut ? "timeout" : "not-run"),
    );

    const warnings = providerTrace
      .filter((trace) => !trace.ok && trace.warning)
      .map((trace) => `${trace.provider}: ${trace.warning}`);

    if (merge.detailed_results.length > 0) {
      const minimalResults: WebSearchResult[] = merge.detailed_results.map((row) => ({
        title: row.title,
        url: row.url,
      }));
      return {
        meta: {
          ok: true,
          duration_ms: Number((nowMs() - started).toFixed(4)),
        },
        data: {
          results: minimalResults,
          ...(debug
            ? {
                debug: {
                  query,
                  provider: merge.primary_provider,
                  warnings,
                  provider_trace: providerTrace,
                  detailed_results: merge.detailed_results,
                },
              }
            : {}),
        },
        error: null,
      };
    }

    return {
      meta: {
        ok: false,
        duration_ms: Number((nowMs() - started).toFixed(4)),
      },
      data: null,
      error: {
        code: timedOut ? "timeout" : "provider-unavailable",
        message: timedOut ? "Global timeout budget reached before providers returned results" : "No provider returned parseable results",
      },
    };
  } catch (error) {
    return {
      meta: {
        ok: false,
        duration_ms: Number((nowMs() - started).toFixed(4)),
      },
      data: null,
      error: {
        code: "internal-error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    clearTimeout(budgetTimer);
  }
}
