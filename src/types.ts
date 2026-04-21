// ─── Types mirroring DB schema + profile_json structure ───

export interface KeywordWithAliases {
  primary: string;
  aliases?: string[];
}

/**
 * Expands a keyword entry (string or KeywordWithAliases) into a flat
 * array of all terms to match against. Always includes the primary term.
 */
export function expandKeyword(entry: string | KeywordWithAliases): string[] {
  if (typeof entry === "string") return [entry.toLowerCase()];
  const terms = [entry.primary.toLowerCase()];
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      terms.push(alias.toLowerCase());
    }
  }
  return terms;
}

/**
 * Extract the primary display name from a keyword entry.
 */
export function getPrimary(entry: string | KeywordWithAliases): string {
  return typeof entry === "string" ? entry : entry.primary;
}

export interface ActiveWork {
  name: string;
  description: string;
  why_news_matters: string;
  aliases?: string[];
}

export interface LocationProfile {
  current_city: string | KeywordWithAliases;
  hometown: string | KeywordWithAliases;
}

export interface ProfileJson {
  name: string;
  role_context: string;
  active_work: ActiveWork[];
  personal_interests: (string | KeywordWithAliases)[];
  locations: LocationProfile;
  financial_interests: (string | KeywordWithAliases)[];
  hobbies: (string | KeywordWithAliases)[];
  tone_preference: string;
  explicit_filters: string[];
  vip_entities: (string | KeywordWithAliases)[];
}

export interface User {
  id: string;
  email: string;
  phone: string | null;
  timezone: string;
  preferred_call_time: string;
  profile_json: ProfileJson;
  created_at: string;
}

export interface NewsPoolItem {
  id: string;
  url: string;
  title: string;
  source: string | null;
  published_at: string | null;
  full_text: string | null;
  summary: string | null;
  fetched_at: string;
}

export interface DailyBriefing {
  id: string;
  user_id: string;
  briefing_date: string;
  briefing_script: string;
  selected_articles_json: EnrichedArticle[];
  ranking_debug_json: ScoredArticleDebug[] | null;
  feedback: object | null;
  created_at: string;
}

// ─── Multi-dimensional matching types ───

export interface MatchedContext {
  vip_matches: string[];
  work_matches: string[];
  financial_matches: string[];
  geo_current_matches: string[];
  geo_hometown_matches: string[];
  interest_matches: string[];
  hobby_matches: string[];
}

export type TriggerType =
  | "outreach_hook"
  | "market_signal"
  | "competitor_move"
  | "learning"
  | "local_relevance"
  | "lifestyle";

// ─── Enriched article for script input ───

export interface EnrichedArticle {
  title: string;
  summary: string | null;
  source: string | null;
  trigger_type: TriggerType;
  matched_context: {
    work: string[];
    financial: string[];
    geo_current: string[];
    geo_hometown: string[];
    hobby: string[];
  };
  why_relevant: string;
  // Preserved for voice agent follow-up (Day 2)
  full_text: string | null;
  url: string;
}

// ─── Ranking types ───

export interface ScoredArticleDebug {
  article_id: string;
  title: string;
  source: string | null;
  final_score: number;
  heuristic_score: number;
  llm_score: number | null;
  negative_signals: string[];
  matches: MatchedContext;
  trigger_type: TriggerType;
  why_relevant: string;
}

export interface RankResult {
  selected: EnrichedArticle[];
  debug: ScoredArticleDebug[];
}

// ─── LLM scorer types ───

export interface ArticleForLlmScoring {
  article_id: string;
  title: string;
  summary: string | null;
}

// ─── Legacy types (kept for compatibility) ───

export interface ArticleScore {
  score: number;
  reason: string;
  matched_fields: string[];
}

export interface ScoreWithReason extends ArticleScore {
  article_id: string;
  title: string;
  source: string | null;
}

// ─── Ingest types ───

export interface RawArticle {
  url: string;
  title: string;
  source: string;
  published_at: string | null;
  summary: string | null;
}
