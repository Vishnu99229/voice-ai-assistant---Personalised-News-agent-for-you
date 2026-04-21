import "dotenv/config";
import { supabase } from "../db/client.js";
import { computeMatchedContext, detectNegativeSignals } from "./matchContext.js";
import { classifyTrigger, buildWhyRelevant } from "./whyRelevant.js";
import { llmRankArticles } from "./llmScorer.js";
import type {
  User,
  NewsPoolItem,
  RankResult,
  ScoredArticleDebug,
  EnrichedArticle,
  MatchedContext,
  ArticleForLlmScoring,
} from "../types.js";

// ─── Heuristic scoring weights ───

const WEIGHTS = {
  vip: 4,
  work: 3,
  financial: 3,
  geo_current: 2,
  geo_hometown: 1,
  interest: 2,
  hobby: 1,
};

/**
 * Compute recency score with linear decay.
 * Max 3 points for articles < 1 hour old, down to 0 for > 24 hours.
 */
function computeRecencyScore(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const hoursAgo = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  if (hoursAgo <= 1) return 3;
  if (hoursAgo <= 6) return 2;
  if (hoursAgo <= 12) return 1;
  if (hoursAgo <= 24) return 0.5;
  return 0;
}

/**
 * Compute raw heuristic score from matched context + recency.
 */
function computeRawHeuristicScore(
  matches: MatchedContext,
  publishedAt: string | null
): number {
  return (
    matches.vip_matches.length * WEIGHTS.vip +
    matches.work_matches.length * WEIGHTS.work +
    matches.financial_matches.length * WEIGHTS.financial +
    matches.geo_current_matches.length * WEIGHTS.geo_current +
    matches.geo_hometown_matches.length * WEIGHTS.geo_hometown +
    matches.interest_matches.length * WEIGHTS.interest +
    matches.hobby_matches.length * WEIGHTS.hobby +
    computeRecencyScore(publishedAt)
  );
}

/**
 * Check if an article matches any explicit filter keywords.
 */
function matchesExplicitFilter(
  article: NewsPoolItem,
  filters: string[]
): boolean {
  const corpus = [article.title, article.summary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return filters.some((filter) => {
    const filterLower = filter.toLowerCase();
    if (filterLower.includes("unless")) {
      const [topic] = filterLower.split("unless").map((s) => s.trim());
      return corpus.includes(topic);
    }
    return corpus.includes(filterLower);
  });
}

/**
 * Count total keyword matches in a MatchedContext.
 */
function totalMatches(m: MatchedContext): number {
  return (
    m.vip_matches.length + m.work_matches.length + m.financial_matches.length +
    m.geo_current_matches.length + m.geo_hometown_matches.length +
    m.interest_matches.length + m.hobby_matches.length
  );
}

/**
 * Main ranking pipeline: heuristic pre-filter + LLM second-pass.
 */
export async function rankArticles(userId: string): Promise<RankResult> {
  console.log("\n===================================================");
  console.log("  RANKING PIPELINE (Hybrid: Heuristic + LLM)");
  console.log("===================================================\n");

  // Load user
  const { data: user, error: userErr } = await supabase
    .from("users").select("*").eq("id", userId).single();
  if (userErr || !user) {
    throw new Error(`User not found: ${userErr?.message || "no data"}`);
  }
  const typedUser = user as User;
  console.log(`User: ${typedUser.profile_json.name} (${typedUser.email})`);

  // Load recent articles (last 30 hours)
  const { data: articles, error: articlesErr } = await supabase
    .from("news_pool").select("*")
    .gte("fetched_at", new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString())
    .order("fetched_at", { ascending: false });
  if (articlesErr) {
    throw new Error(`Failed to load articles: ${articlesErr.message}`);
  }
  if (!articles || articles.length === 0) {
    console.log("No articles found in news_pool from the last 30 hours.");
    console.log("  Run `npm run ingest` first.");
    return { selected: [], debug: [] };
  }
  console.log(`${articles.length} articles to score\n`);

  // ─── STEP 1: Heuristic scoring with negative signal detection ───
  console.log("--- Step 1: Heuristic pre-filter ---\n");

  interface HeuristicResult {
    article: NewsPoolItem;
    matches: MatchedContext;
    rawScore: number;
    negativeSignals: string[];
    heuristicScore: number;
  }

  const heuristicResults: HeuristicResult[] = [];
  let filteredByExplicit = 0;
  let filteredByNoMatch = 0;

  for (const article of articles as NewsPoolItem[]) {
    if (matchesExplicitFilter(article, typedUser.profile_json.explicit_filters)) {
      filteredByExplicit++;
      continue;
    }
    const matches = computeMatchedContext(article, typedUser.profile_json);
    if (totalMatches(matches) === 0) {
      filteredByNoMatch++;
      continue;
    }
    const rawScore = computeRawHeuristicScore(matches, article.published_at);
    const negativeSignals = detectNegativeSignals({
      title: article.title,
      summary: article.summary,
    });
    const negativePenalty = negativeSignals.length * 2;
    const heuristicScore = Math.max(0, rawScore - negativePenalty);

    if (negativeSignals.length > 0) {
      console.log(`  [rank] Negative signals for "${article.title.slice(0, 60)}": ${negativeSignals.join(", ")} -> penalty: -${negativePenalty}`);
    }

    heuristicResults.push({
      article, matches, rawScore, negativeSignals, heuristicScore,
    });
  }

  console.log(`\n  Heuristic: ${heuristicResults.length} matched, ${filteredByExplicit} explicit-filtered, ${filteredByNoMatch} no-match\n`);

  // Sort by heuristic score descending, take top 40 for LLM pass
  heuristicResults.sort((a, b) => b.heuristicScore - a.heuristicScore);
  const candidates = heuristicResults.filter((r) => r.heuristicScore > 0).slice(0, 40);

  console.log(`  Top ${candidates.length} candidates passed to LLM second-pass\n`);

  // ─── STEP 2: LLM second-pass scoring ───
  console.log("--- Step 2: LLM second-pass scoring ---\n");

  const articlesForLlm: ArticleForLlmScoring[] = candidates.map((c) => ({
    article_id: c.article.id,
    title: c.article.title,
    summary: c.article.summary,
  }));

  const llmScores = await llmRankArticles(articlesForLlm, typedUser.profile_json);
  const llmAvailable = llmScores.size > 0;

  if (!llmAvailable) {
    console.log("\n  [rank] LLM scoring failed, falling back to heuristic-only ranking\n");
  }

  // ─── STEP 3: Combine scores ───
  console.log("\n--- Step 3: Combined scoring ---\n");

  const allScored: ScoredArticleDebug[] = [];

  for (const c of candidates) {
    const llmScore = llmScores.get(c.article.id) ?? null;
    let finalScore: number;

    if (llmAvailable && llmScore !== null) {
      finalScore = c.heuristicScore * 0.4 + llmScore * 0.6;
    } else {
      finalScore = c.heuristicScore;
    }

    const triggerType = classifyTrigger(c.matches);
    const whyRelevant = buildWhyRelevant(c.matches, typedUser.profile_json);

    // Determine outcome label for logging
    let outcome = "";
    if (llmAvailable && llmScore !== null) {
      if (llmScore > c.heuristicScore) outcome = "PROMOTED by LLM";
      else if (llmScore < c.heuristicScore) outcome = "DEMOTED by LLM";
      else outcome = "UNCHANGED";
    }

    console.log(
      `  [rank] "${c.article.title.slice(0, 55)}" -- Heuristic: ${c.heuristicScore} | LLM: ${llmScore ?? "n/a"} | Combined: ${finalScore.toFixed(1)}${outcome ? ` | ${outcome}` : ""}`
    );

    allScored.push({
      article_id: c.article.id,
      title: c.article.title,
      source: c.article.source,
      final_score: parseFloat(finalScore.toFixed(2)),
      heuristic_score: c.heuristicScore,
      llm_score: llmScore,
      negative_signals: c.negativeSignals,
      matches: c.matches,
      trigger_type: triggerType,
      why_relevant: whyRelevant,
    });
  }

  // Sort by final_score descending, take top 10
  allScored.sort((a, b) => b.final_score - a.final_score);
  const top10 = allScored.slice(0, 10);

  // ─── Debug table ───
  console.log("\n+----+-------------------------------------------+------+-----+--------+----------------+");
  console.log("| Rk | Title                                     | Heur | LLM | Final  | Trigger        |");
  console.log("+----+-------------------------------------------+------+-----+--------+----------------+");
  for (let i = 0; i < top10.length; i++) {
    const s = top10[i];
    const rk = String(i + 1).padStart(2);
    const title = s.title.slice(0, 41).padEnd(41);
    const heur = String(s.heuristic_score).padStart(4);
    const llm = s.llm_score !== null ? String(s.llm_score).padStart(3) : "n/a";
    const fin = s.final_score.toFixed(1).padStart(5);
    const trig = s.trigger_type.padEnd(14);
    console.log(`| ${rk} | ${title} | ${heur} | ${llm} | ${fin}  | ${trig} |`);
  }
  console.log("+----+-------------------------------------------+------+-----+--------+----------------+");

  // Match breakdown
  console.log("\nMatch breakdown for top articles:\n");
  for (let i = 0; i < top10.length; i++) {
    const s = top10[i];
    console.log(`  ${i + 1}. "${s.title.slice(0, 60)}"`);
    console.log(`     Heuristic: ${s.heuristic_score} | LLM: ${s.llm_score ?? "n/a"} | Final: ${s.final_score} | Trigger: ${s.trigger_type}`);
    if (s.matches.vip_matches.length) console.log(`     VIP: [${s.matches.vip_matches.join(", ")}]`);
    if (s.matches.work_matches.length) console.log(`     Work: [${s.matches.work_matches.join(", ")}]`);
    if (s.matches.financial_matches.length) console.log(`     Financial: [${s.matches.financial_matches.join(", ")}]`);
    if (s.matches.geo_current_matches.length) console.log(`     Geo (current): [${s.matches.geo_current_matches.join(", ")}]`);
    if (s.matches.geo_hometown_matches.length) console.log(`     Geo (hometown): [${s.matches.geo_hometown_matches.join(", ")}]`);
    if (s.matches.interest_matches.length) console.log(`     Interests: [${s.matches.interest_matches.join(", ")}]`);
    if (s.matches.hobby_matches.length) console.log(`     Hobbies: [${s.matches.hobby_matches.join(", ")}]`);
    if (s.negative_signals.length) console.log(`     Negative: [${s.negative_signals.join(", ")}]`);
    console.log(`     -> ${s.why_relevant}\n`);
  }

  if (top10.length === 0) {
    console.log("\nNo articles matched the profile. Consider running ingest again or adjusting profile keywords.\n");
  }

  // Build enriched articles for script generation
  const articleMap = new Map<string, NewsPoolItem>();
  for (const a of articles as NewsPoolItem[]) articleMap.set(a.id, a);

  const selected: EnrichedArticle[] = top10.map((scored) => {
    const article = articleMap.get(scored.article_id)!;
    return {
      title: article.title,
      summary: article.summary,
      source: article.source,
      trigger_type: scored.trigger_type,
      matched_context: {
        work: scored.matches.work_matches,
        financial: scored.matches.financial_matches,
        geo_current: scored.matches.geo_current_matches,
        geo_hometown: scored.matches.geo_hometown_matches,
        hobby: scored.matches.hobby_matches,
      },
      why_relevant: scored.why_relevant,
      full_text: article.full_text,
      url: article.url,
    };
  });

  return { selected, debug: allScored };
}
