import axios from "axios";
import "dotenv/config";
import type { RawArticle } from "../types.js";
import { NEWSAPI_QUERIES } from "./sources.js";

const API_KEY = process.env.NEWSAPI_KEY;
const BASE_URL = "https://newsapi.org/v2";

interface NewsApiArticle {
  title: string;
  url: string;
  source: { name: string };
  publishedAt: string;
  description: string | null;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
}

export async function fetchNewsApi(): Promise<RawArticle[]> {
  if (!API_KEY) {
    console.warn("  ⚠ NEWSAPI_KEY not set — skipping NewsAPI");
    return [];
  }

  const articles: RawArticle[] = [];

  // 1. Top headlines for India
  try {
    const { data } = await axios.get<NewsApiResponse>(
      `${BASE_URL}/top-headlines`,
      {
        params: { country: "in", pageSize: 30, apiKey: API_KEY },
        timeout: 15_000,
      }
    );

    for (const a of data.articles || []) {
      if (a.url && a.title && a.title !== "[Removed]") {
        articles.push({
          url: a.url,
          title: a.title.trim(),
          source: `NewsAPI / ${a.source?.name || "Unknown"}`,
          published_at: a.publishedAt
            ? new Date(a.publishedAt).toISOString()
            : null,
          summary: a.description?.slice(0, 500) || null,
        });
      }
    }
    console.log(`  ✓ NewsAPI top-headlines India: ${data.articles?.length || 0} articles`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ NewsAPI top-headlines failed: ${msg}`);
  }

  // 2. Everything queries for specific keywords
  for (const q of NEWSAPI_QUERIES) {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const { data } = await axios.get<NewsApiResponse>(
        `${BASE_URL}/everything`,
        {
          params: {
            q,
            from: yesterday,
            sortBy: "relevancy",
            pageSize: 15,
            language: "en",
            apiKey: API_KEY,
          },
          timeout: 15_000,
        }
      );

      for (const a of data.articles || []) {
        if (a.url && a.title && a.title !== "[Removed]") {
          articles.push({
            url: a.url,
            title: a.title.trim(),
            source: `NewsAPI / ${a.source?.name || "Unknown"}`,
            published_at: a.publishedAt
              ? new Date(a.publishedAt).toISOString()
              : null,
            summary: a.description?.slice(0, 500) || null,
          });
        }
      }
      console.log(
        `  ✓ NewsAPI "${q}": ${data.articles?.length || 0} articles`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠ NewsAPI query "${q}" failed: ${msg}`);
    }
  }

  console.log(`📡 NewsAPI: ${articles.length} total articles`);
  return articles;
}
