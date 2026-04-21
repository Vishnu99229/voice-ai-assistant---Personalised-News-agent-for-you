import type { RawArticle } from "../types.js";

/**
 * Tokenize a title for Jaccard similarity.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2) // skip tiny words like "a", "of"
  );
}

/**
 * Jaccard similarity between two sets.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Normalize a URL for comparison (strip protocol, www, trailing slash, query params).
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/+$/, "");
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Deduplicate articles by:
 * 1. Exact URL match (normalized)
 * 2. Title similarity (Jaccard > 0.8)
 */
export function dedupeArticles(articles: RawArticle[]): {
  unique: RawArticle[];
  duplicateCount: number;
} {
  const seen = new Map<string, { article: RawArticle; tokens: Set<string> }>();
  let duplicateCount = 0;

  for (const article of articles) {
    const normUrl = normalizeUrl(article.url);

    // Check URL duplicate
    if (seen.has(normUrl)) {
      duplicateCount++;
      continue;
    }

    // Check title similarity against all seen articles
    const tokens = tokenize(article.title);
    let isDup = false;

    for (const [, entry] of seen) {
      if (jaccard(tokens, entry.tokens) > 0.8) {
        isDup = true;
        duplicateCount++;
        break;
      }
    }

    if (!isDup) {
      seen.set(normUrl, { article, tokens });
    }
  }

  return {
    unique: Array.from(seen.values()).map((e) => e.article),
    duplicateCount,
  };
}
