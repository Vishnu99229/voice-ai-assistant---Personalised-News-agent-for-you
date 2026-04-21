import OpenAI from "openai";
import { z } from "zod";
import "dotenv/config";
import { buildLlmScoringPrompt } from "./prompt.js";
import type { ProfileJson, ArticleForLlmScoring } from "../types.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Zod schema for validating a single LLM score entry
const LlmScoreEntry = z.object({
  article_id: z.string(),
  llm_score: z.number().min(0).max(10),
  reasoning: z.string(),
});

const LlmScoreArray = z.array(LlmScoreEntry);

/**
 * LLM second-pass scorer. Sends articles in batches of 10 to GPT-4o
 * for meaning-based relevance scoring. Returns a Map of article_id to llm_score.
 *
 * On failure, returns an empty Map (caller falls back to heuristic-only).
 */
export async function llmRankArticles(
  articles: ArticleForLlmScoring[],
  profile: ProfileJson
): Promise<Map<string, number>> {
  const scoreMap = new Map<string, number>();

  if (articles.length === 0) return scoreMap;

  const systemPrompt = buildLlmScoringPrompt(profile);
  const BATCH_SIZE = 10;
  const batches: ArticleForLlmScoring[][] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    batches.push(articles.slice(i, i + BATCH_SIZE));
  }

  const totalBatches = batches.length;
  let scoredCount = 0;
  let failedBatches = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`  [llm] Scoring batch ${batchIdx + 1}/${totalBatches}: ${batch.length} articles`);

    const userContent = batch
      .map(
        (a) =>
          `article_id: ${a.article_id}\nTitle: ${a.title}\nSummary: ${(a.summary || "No summary available").slice(0, 400)}`
      )
      .join("\n---\n");

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1000,
      }, {
        timeout: 15000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.warn(`  [llm] Empty response for batch ${batchIdx + 1}, skipping`);
        failedBatches++;
        continue;
      }

      // Parse JSON -- handle both array and {scores: [...]} formats
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        console.warn(`  [llm] Invalid JSON in batch ${batchIdx + 1}, skipping`);
        failedBatches++;
        continue;
      }

      // Handle wrapped format like { "scores": [...] }
      let arrayToParse = parsed;
      if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
        const values = Object.values(parsed as Record<string, unknown>);
        if (values.length === 1 && Array.isArray(values[0])) {
          arrayToParse = values[0];
        }
      }

      const validated = LlmScoreArray.safeParse(arrayToParse);
      if (!validated.success) {
        console.warn(`  [llm] Zod validation failed for batch ${batchIdx + 1}: ${validated.error.message}`);
        failedBatches++;
        continue;
      }

      for (const entry of validated.data) {
        scoreMap.set(entry.article_id, entry.llm_score);
        scoredCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [llm] Batch ${batchIdx + 1} failed: ${msg}`);
      failedBatches++;
    }
  }

  if (failedBatches === totalBatches && totalBatches > 0) {
    console.error("  [llm] ALL batches failed. Returning empty Map (heuristic-only fallback).");
    return new Map();
  }

  console.log(`  [llm] Scoring complete: ${scoredCount}/${articles.length} articles scored (${failedBatches} batch failures)`);
  return scoreMap;
}
