import { supabase } from "../db/client.js";
import { fetchRssFeeds } from "./fetchRss.js";
import { fetchNewsApi } from "./fetchNewsApi.js";
import { dedupeArticles } from "./dedupe.js";
import { scrapeFullText } from "./scrapeFullText.js";
import type { RawArticle } from "../types.js";

/**
 * Full ingest orchestrator:
 * 1. Fetch from all RSS feeds + NewsAPI
 * 2. Deduplicate by URL and title similarity
 * 3. Scrape full text for unique articles
 * 4. Upsert to news_pool
 */
export async function runIngest(): Promise<void> {
  console.log("\n═══════════════════════════════════════");
  console.log("  📥 INGEST PIPELINE");
  console.log("═══════════════════════════════════════\n");

  // 1. Fetch from all sources
  console.log("→ Fetching RSS feeds…");
  const rssArticles = await fetchRssFeeds();

  console.log("\n→ Fetching NewsAPI…");
  const newsApiArticles = await fetchNewsApi();

  const allArticles: RawArticle[] = [...rssArticles, ...newsApiArticles];
  console.log(`\n📊 Total raw articles: ${allArticles.length}`);

  // 2. Deduplicate BEFORE scraping (scraping is the expensive step)
  console.log("\n→ Deduplicating…");
  const { unique, duplicateCount } = dedupeArticles(allArticles);
  console.log(
    `🔄 ${duplicateCount} duplicates removed, ${unique.length} unique articles`
  );

  // 3. Scrape full text in batches of 5
  console.log("\n→ Scraping full text…");
  let scrapeSuccess = 0;
  let scrapeFail = 0;
  const BATCH_SIZE = 5;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (article) => {
        const text = await scrapeFullText(article.url);
        return { article, text };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.text) {
        (result.value.article as any)._fullText = result.value.text;
        scrapeSuccess++;
      } else {
        scrapeFail++;
      }
    }

    // Progress indicator
    const done = Math.min(i + BATCH_SIZE, unique.length);
    process.stdout.write(`  Scraped ${done}/${unique.length}\r`);
  }
  console.log(`\n✅ Scraped: ${scrapeSuccess} succeeded, ${scrapeFail} failed`);

  // 4. Upsert to news_pool
  console.log("\n→ Upserting to news_pool…");
  let upsertCount = 0;

  // Batch upserts to avoid payload limits
  const UPSERT_BATCH = 20;
  for (let i = 0; i < unique.length; i += UPSERT_BATCH) {
    const batch = unique.slice(i, i + UPSERT_BATCH);
    const rows = batch.map((a) => ({
      url: a.url,
      title: a.title,
      source: a.source,
      published_at: a.published_at,
      full_text: (a as any)._fullText || null,
      summary: a.summary,
    }));

    const { error, data } = await supabase
      .from("news_pool")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.warn(`  ⚠ Upsert batch ${i} failed: ${error.message}`);
    } else {
      upsertCount += data?.length || 0;
    }
  }

  // Summary
  console.log("\n═══════════════════════════════════════");
  console.log(
    `  Fetched ${allArticles.length} articles from ${8 + 1} sources (RSS + NewsAPI)`
  );
  console.log(`  ${duplicateCount} duplicates removed`);
  console.log(
    `  ${scrapeSuccess} scraped successfully, ${scrapeFail} failed`
  );
  console.log(`  ${upsertCount} upserted to news_pool`);
  console.log("═══════════════════════════════════════\n");
}
