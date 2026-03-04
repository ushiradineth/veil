import type { FetchUrlFormat, FetchUrlResponse } from "./types";
import { NodeHtmlMarkdown } from "node-html-markdown";

function nowMs(bunLike: { nanoseconds?: () => number } | undefined = typeof Bun === "undefined" ? undefined : Bun): number {
  if (bunLike && typeof bunLike.nanoseconds === "function") {
    return Number(bunLike.nanoseconds()) / 1_000_000;
  }
  return Date.now();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

const NHM = new NodeHtmlMarkdown({
  maxConsecutiveNewlines: 3,
});

function htmlToMarkdown(html: string): string {
  try {
    return collapseWhitespace(NHM.translate(html));
  } catch {
    return collapseWhitespace(decodeHtml(stripTags(html)));
  }
}

function htmlToText(html: string): string {
  const out = decodeHtml(stripTags(html));
  return collapseWhitespace(out);
}

function chooseAccept(format: FetchUrlFormat): string {
  if (format === "html") {
    return "text/html, application/xhtml+xml;q=0.9, text/plain;q=0.5, */*;q=0.1";
  }
  if (format === "text") {
    return "text/plain, text/markdown;q=0.9, text/html;q=0.7, */*;q=0.1";
  }
  return "text/markdown, text/plain;q=0.9, text/html;q=0.8, application/xhtml+xml;q=0.7, */*;q=0.1";
}

function contentTypeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "").toLowerCase();
}

function parseMarkdownTokens(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.floor(parsed);
}

function isHtml(contentType: string): boolean {
  return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
}

function isMarkdown(contentType: string): boolean {
  return contentType.includes("text/markdown") || contentType.includes("text/x-markdown") || contentType.includes("markdown");
}

function truncateTo(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const bytes = Buffer.byteLength(value, "utf-8");
  if (bytes <= maxBytes) return { value, truncated: false };

  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const sliced = value.slice(0, mid);
    if (Buffer.byteLength(sliced, "utf-8") <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { value: value.slice(0, low), truncated: true };
}

function parseUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchUrl(
  options: {
    url: string;
    format?: FetchUrlFormat;
    timeout_ms?: number;
    max_bytes?: number;
    fetch_impl?: typeof fetch;
  },
): Promise<FetchUrlResponse> {
  const started = nowMs();
  const parsed = parseUrl(options.url.trim());
  const format: FetchUrlFormat = options.format ?? "markdown";
  const timeoutMs = Math.min(20_000, Math.max(300, options.timeout_ms ?? 8_000));
  const maxBytes = Math.min(2_000_000, Math.max(100, options.max_bytes ?? 200_000));

  if (!parsed) {
    return {
      meta: { ok: false, duration_ms: Number((nowMs() - started).toFixed(4)), truncated: false },
      data: null,
      error: { code: "invalid-url", message: "URL must be a valid http(s) URL" },
    };
  }

  const fetchImpl = options.fetch_impl ?? fetch;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort("timeout"), timeoutMs);

  try {
    const response = await fetchImpl(parsed.toString(), {
      method: "GET",
      headers: {
        accept: chooseAccept(format),
        "user-agent": "veil-fetch-url/1.0",
      },
      signal: abort.signal,
    });

    const contentType = contentTypeOf(response);
    const status = response.status;
    const markdownTokens = parseMarkdownTokens(response.headers.get("x-markdown-tokens"));
    const contentSignal = response.headers.get("content-signal");
    const vary = response.headers.get("vary");
    const raw = await response.text();

    let transformed = raw;
    if (format === "markdown") {
      if (isHtml(contentType)) {
        transformed = htmlToMarkdown(raw);
      }
    } else if (format === "text") {
      if (isHtml(contentType) || isMarkdown(contentType)) {
        transformed = htmlToText(raw);
      }
    }

    const truncated = truncateTo(transformed, maxBytes);
    if (!response.ok) {
      return {
        meta: {
          ok: false,
          duration_ms: Number((nowMs() - started).toFixed(4)),
          truncated: truncated.truncated,
        },
        data: {
          url: parsed.toString(),
          final_url: response.url || parsed.toString(),
          status,
          content_type: contentType,
          format,
          markdown_tokens: markdownTokens,
          content_signal: contentSignal,
          vary,
          content: truncated.value,
        },
        error: { code: "fetch-failed", message: `HTTP ${status}` },
      };
    }

    return {
      meta: {
        ok: true,
        duration_ms: Number((nowMs() - started).toFixed(4)),
        truncated: truncated.truncated,
      },
      data: {
        url: parsed.toString(),
        final_url: response.url || parsed.toString(),
        status,
        content_type: contentType,
        format,
        markdown_tokens: markdownTokens,
        content_signal: contentSignal,
        vary,
        content: truncated.value,
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeoutLike = abort.signal.aborted || message.includes("AbortError") || message.toLowerCase().includes("timeout");
    return {
      meta: { ok: false, duration_ms: Number((nowMs() - started).toFixed(4)), truncated: false },
      data: null,
      error: {
        code: timeoutLike ? "timeout" : "internal-error",
        message,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export const __internalFetchUrl = {
  nowMs,
  decodeHtml,
  stripTags,
  collapseWhitespace,
  htmlToMarkdown,
  htmlToText,
  chooseAccept,
  contentTypeOf,
  parseMarkdownTokens,
  isHtml,
  isMarkdown,
  truncateTo,
  parseUrl,
  NHM,
};
