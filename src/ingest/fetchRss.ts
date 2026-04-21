import Parser from "rss-parser";
import type { RawArticle } from "../types.js";
import { RSS_FEEDS } from "./sources.js";

const parser = new Parser({
  timeout: 15_000,
  headers: {
    "User-Agent": "MorningBriefAgent/1.0",
  },
});

export async function fetchRssFeeds(): Promise<RawArticle[]> {
  const articles: RawArticle[] = [];
  let successCount = 0;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const result = await parser.parseURL(feed.url);
        const items: RawArticle[] = (result.items || [])
          .filter((item) => item.link && item.title)
          .map((item) => ({
            url: item.link!,
            title: item.title!.trim(),
            source: feed.name,
            published_at: item.pubDate
              ? new Date(item.pubDate).toISOString()
              : null,
            summary: item.contentSnippet?.slice(0, 500) || null,
          }));
        return { feed: feed.name, items };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  ⚠ RSS feed "${feed.name}" failed: ${msg}`);
        return { feed: feed.name, items: [] };
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.items.length > 0) {
      articles.push(...result.value.items);
      successCount++;
      console.log(
        `  ✓ ${result.value.feed}: ${result.value.items.length} articles`
      );
    } else if (result.status === "fulfilled") {
      console.log(`  – ${result.value.feed}: 0 articles`);
    }
  }

  console.log(
    `📡 RSS: ${articles.length} articles from ${successCount}/${RSS_FEEDS.length} feeds`
  );
  return articles;
}
