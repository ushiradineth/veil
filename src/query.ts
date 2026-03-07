import type { ChunkRecord, LookupConfidence, LookupReason, SymbolRecord } from "./types";

type ParsedQueryLike = {
  normalized: string;
  tokens: string[];
};

function normalizeText(input: string): string {
  return input.toLowerCase();
}

export function toConfidence(score: number): LookupConfidence {
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

export function scoreFile(path: string, parsed: ParsedQueryLike): { score: number; reasons: LookupReason[] } {
  const pathLower = normalizeText(path);
  let score = pathLower.includes(parsed.normalized) ? 8 : 2;
  const reasons: LookupReason[] = [];
  if (pathLower.includes(parsed.normalized)) {
    reasons.push({ label: "exact-path-match", detail: "Path contains the full normalized query" });
  }
  for (const token of parsed.tokens) {
    if (pathLower.includes(token)) {
      score += 1.5;
      reasons.push({ label: "token-path-match", detail: `Path contains token '${token}'` });
    }
  }
  return { score, reasons };
}

export function scoreSymbol(symbol: SymbolRecord, parsed: ParsedQueryLike): { score: number; reasons: LookupReason[] } {
  const nameLower = normalizeText(symbol.name);
  const pathLower = normalizeText(symbol.path);
  let score = nameLower.includes(parsed.normalized) ? 9 : 3;
  const reasons: LookupReason[] = [];
  if (nameLower.includes(parsed.normalized)) {
    reasons.push({ label: "exact-symbol-match", detail: "Symbol name contains the full query" });
  }
  for (const token of parsed.tokens) {
    if (nameLower.includes(token)) {
      score += 2;
      reasons.push({ label: "token-symbol-match", detail: `Symbol name contains token '${token}'` });
    }
    if (pathLower.includes(token)) {
      score += 0.8;
      reasons.push({ label: "token-path-context", detail: `Symbol path contains token '${token}'` });
    }
  }
  return { score, reasons };
}

export function scoreChunk(chunk: ChunkRecord, parsed: ParsedQueryLike): { score: number; reasons: LookupReason[] } {
  const hay = normalizeText(`${chunk.path}\n${chunk.content}`);
  const pathLower = normalizeText(chunk.path);
  let score = hay.includes(parsed.normalized) ? 7 : 2;
  const reasons: LookupReason[] = [];
  if (hay.includes(parsed.normalized)) {
    reasons.push({ label: "exact-content-match", detail: "Chunk content contains the full query" });
  }
  for (const token of parsed.tokens) {
    if (hay.includes(token)) {
      score += 1.3;
      reasons.push({ label: "token-content-match", detail: `Chunk content contains token '${token}'` });
    }
    if (pathLower.includes(token)) {
      score += 1;
      reasons.push({ label: "token-path-match", detail: `Chunk path contains token '${token}'` });
    }
  }
  return { score, reasons };
}

export function ensureLookupReasons(reasons: LookupReason[], label: string, detail: string): LookupReason[] {
  if (reasons.length > 0) return reasons;
  return [{ label, detail }];
}

export function rankLookupResults<T>(
  items: T[],
  scorer: (item: T) => { score: number; reasons: LookupReason[] },
  fallbackReason: { label: string; detail: string },
): { item: T; score: number; confidence: LookupConfidence; reasons: LookupReason[] }[] {
  return items
    .map((item) => {
      const scored = scorer(item);
      const reasons = ensureLookupReasons(scored.reasons, fallbackReason.label, fallbackReason.detail);
      return { item, score: scored.score, confidence: toConfidence(scored.score), reasons };
    })
    .sort((a, b) => b.score - a.score);
}
