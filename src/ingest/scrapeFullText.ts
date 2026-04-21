import { extract } from "@extractus/article-extractor";

/**
 * Scrape full article text from a URL.
 * Returns the text or null on failure (never throws).
 */
export async function scrapeFullText(url: string): Promise<string | null> {
  try {
    const article = await extract(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    } as any);

    if (!article || !article.content) return null;

    // Strip HTML tags to get plain text
    const plainText = article.content
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    return plainText || null;
  } catch {
    return null;
  }
}
