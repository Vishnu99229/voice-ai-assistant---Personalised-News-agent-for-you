import type { ProfileJson } from "../types.js";
import { getPrimary } from "../types.js";

const SYSTEM_MESSAGE = `You are a news relevance scorer. Given a user profile and one news article, return a JSON object: {"score": 0-10, "reason": "string", "matched_fields": ["string"]}.

Score strictly:
- 10 = directly actionable for their active work or names a VIP entity.
- 7-9 = clearly relevant to interests or locations.
- 4-6 = tangentially interesting.
- 0-3 = irrelevant or in explicit_filters.

Be harsh -- most articles should score below 6.`;

export function buildRankingPrompt(
  profile: ProfileJson,
  article: { title: string; source: string | null; summary_or_text: string }
): { role: string; content: string }[] {
  const userMessage = `## User Profile
${JSON.stringify(profile, null, 2)}

## Article
Title: ${article.title}
Source: ${article.source || "Unknown"}
Content: ${article.summary_or_text}

Return your JSON score now.`;

  return [
    { role: "system", content: SYSTEM_MESSAGE },
    { role: "user", content: userMessage },
  ];
}

/**
 * Build the system prompt for LLM batch scoring (second-pass).
 * Includes a condensed version of the user profile for context.
 */
export function buildLlmScoringPrompt(profile: ProfileJson): string {
  const workSummary = profile.active_work
    .map((w) => `${w.name}: ${w.description}`)
    .join("; ");
  const financialSummary = profile.financial_interests
    .map((f) => getPrimary(f))
    .join(", ");
  const vipSummary = profile.vip_entities
    .map((v) => getPrimary(v))
    .join(", ");
  const currentCity = getPrimary(profile.locations.current_city);
  const hometown = getPrimary(profile.locations.hometown);

  return `You are a relevance scorer for a personalized morning news briefing.

The user's context:
- Active work: ${workSummary}
- Financial interests: ${financialSummary}
- VIP entities: ${vipSummary}
- Current city: ${currentCity}
- Hometown: ${hometown}

Score each article from 0 to 10 based on how relevant it is to THIS specific user.

SCORING CRITERIA:
- 8-10: Directly affects user's active work, companies, or financial positions. Actionable.
- 6-7: Related to user's industry, ecosystem, or investment thesis. Informative.
- 4-5: Tangentially relevant. Same sector or geography but no direct connection.
- 2-3: General news with weak connection to user's context.
- 0-1: No meaningful connection to user's life or work.

CRITICAL RULES:
- Score based on MEANING, not keyword presence. An article about "restaurant technology trends in India" is highly relevant to someone building restaurant SaaS, even if their company name is never mentioned.
- An article that keyword-matches a VIP entity but is about an unrelated topic should score LOW (2-3), not high.
- Geographic relevance alone (city mentioned) without business or personal connection is worth 3-4 at most.
- Do NOT give everything a high score. Differentiate aggressively. A good batch of 10 should have scores ranging from 1 to 9.

Return ONLY a JSON array, no other text:
[
  { "article_id": "...", "llm_score": 7, "reasoning": "one sentence" }
]`;
}
