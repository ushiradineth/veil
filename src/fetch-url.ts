import { isIP } from "node:net";

import { NodeHtmlMarkdown } from "node-html-markdown";

import { errorMessage, isAbortLike } from "./errors";
import type { FetchUrlFormat, FetchUrlResponse } from "./types";
import { clampInt } from "./validation";

function nowMs(
  bunLike: { nanoseconds?: () => number } | undefined = typeof Bun === "undefined"
    ? undefined
    : Bun,
): number {
  if (bunLike && typeof bunLike.nanoseconds === "function") {
    return bunLike.nanoseconds() / 1_000_000;
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
  return (
    contentType.includes("text/markdown") ||
    contentType.includes("text/x-markdown") ||
    contentType.includes("markdown")
  );
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

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::" || lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    return isPrivateIpv4(mapped);
  }
  if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  return false;
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!lower) return true;
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "metadata.google.internal" || lower === "metadata") return true;

  const ipType = isIP(lower);
  if (ipType === 4) return isPrivateIpv4(lower);
  if (ipType === 6) return isPrivateIpv6(lower);
  return false;
}

function validateUrlHost(parsed: URL, allowPrivateNetwork: boolean): string | null {
  if (allowPrivateNetwork) return null;
  if (isBlockedHost(parsed.hostname)) {
    return `Refusing private or local host: ${parsed.hostname}`;
  }
  return null;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Fetches URL content with markdown-first negotiation and security hardening.
 *
 * Security features:
 * - URL scheme validation: only http/https allowed (prevents file://, javascript:, data:, etc.)
 * - Timeout bounds: minimum 100ms, maximum 20s (enforced internally)
 * - Size limits: maximum 2MB response (prevents memory exhaustion)
 * - No arbitrary code execution
 *
 * @param options - Fetch options
 * @param options.url - URL to fetch (must be http or https)
 * @param options.format - Output format: markdown, text, or html (default: markdown)
 * @param options.timeout_ms - Timeout in milliseconds (100-20000, default 8000)
 * @param options.max_bytes - Maximum response size in bytes (100-2000000, default 200000)
 * @param options.fetch_impl - Custom fetch implementation for testing
 * @returns Fetch URL response with content and metadata
 */
export async function fetchUrl(options: {
  url: string;
  format?: FetchUrlFormat;
  timeout_ms?: number;
  max_bytes?: number;
  allow_private_network?: boolean;
  fetch_impl?: typeof fetch;
}): Promise<FetchUrlResponse> {
  const started = nowMs();
  const parsed = parseUrl(options.url.trim());
  const format: FetchUrlFormat = options.format ?? "markdown";
  // Enforce timeout bounds: min 100ms, max 20s
  const timeoutMs = clampInt(options.timeout_ms, 100, 20_000, 8_000);
  const maxBytes = clampInt(options.max_bytes, 100, 2_000_000, 200_000);
  const allowPrivateNetwork = options.allow_private_network ?? false;

  if (!parsed) {
    return {
      meta: { ok: false, duration_ms: Number((nowMs() - started).toFixed(4)), truncated: false },
      data: null,
      error: { code: "invalid-url", message: "URL must be a valid http(s) URL" },
    };
  }

  const initialHostError = validateUrlHost(parsed, allowPrivateNetwork);
  if (initialHostError) {
    return {
      meta: { ok: false, duration_ms: Number((nowMs() - started).toFixed(4)), truncated: false },
      data: null,
      error: { code: "blocked-host", message: initialHostError },
    };
  }

  const fetchImpl = options.fetch_impl ?? fetch;
  const abort = new AbortController();
  const timer = setTimeout(() => {
    abort.abort("timeout");
  }, timeoutMs);

  try {
    let current = parsed;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        headers: {
          accept: chooseAccept(format),
          "user-agent": "veil-fetch-url/1.0",
        },
        redirect: "manual",
        signal: abort.signal,
      });

      if (!isRedirectStatus(response.status)) {
        break;
      }
      const location = response.headers.get("location");
      if (!location) {
        break;
      }
      const redirected = new URL(location, current);
      const redirectedHostError = validateUrlHost(redirected, allowPrivateNetwork);
      if (redirectedHostError) {
        return {
          meta: {
            ok: false,
            duration_ms: Number((nowMs() - started).toFixed(4)),
            truncated: false,
          },
          data: null,
          error: { code: "blocked-host", message: redirectedHostError },
        };
      }
      current = redirected;
      if (redirectCount === 5) {
        return {
          meta: {
            ok: false,
            duration_ms: Number((nowMs() - started).toFixed(4)),
            truncated: false,
          },
          data: null,
          error: { code: "fetch-failed", message: "Too many redirects" },
        };
      }
    }
    if (!response) {
      return {
        meta: { ok: false, duration_ms: Number((nowMs() - started).toFixed(4)), truncated: false },
        data: null,
        error: { code: "fetch-failed", message: "No response from fetch" },
      };
    }

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
          final_url: response.url || current.toString(),
          status,
          content_type: contentType,
          format,
          markdown_tokens: markdownTokens,
          content_signal: contentSignal,
          vary,
          content: truncated.value,
        },
        error: { code: "fetch-failed", message: `HTTP ${String(status)}` },
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
        final_url: response.url || current.toString(),
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
    const message = errorMessage(error);
    const timeoutLike = isAbortLike(abort.signal.aborted, message);
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
  isBlockedHost,
  validateUrlHost,
  isRedirectStatus,
  NHM,
};
