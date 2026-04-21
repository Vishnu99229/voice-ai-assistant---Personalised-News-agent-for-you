import type {
  ProfileJson,
  NewsPoolItem,
  MatchedContext,
  KeywordWithAliases,
} from "../types.js";
import { expandKeyword, getPrimary } from "../types.js";

function buildCorpus(article: NewsPoolItem): string {
  return [article.title, article.summary, article.full_text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesKeyword(corpus: string, keyword: string): boolean {
  const lower = keyword.toLowerCase();
  if (lower.length <= 3) {
    const regex = new RegExp(`\\b${escapeRegex(lower)}\\b`, "i");
    return regex.test(corpus);
  }
  return corpus.includes(lower);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchWithAliases(
  corpus: string,
  entries: (string | KeywordWithAliases)[]
): string[] {
  const matched: string[] = [];
  for (const entry of entries) {
    const terms = expandKeyword(entry);
    const primary = getPrimary(entry);
    if (terms.some((term) => matchesKeyword(corpus, term))) {
      matched.push(primary);
    }
  }
  return matched;
}

function extractWorkKeywordsExpanded(
  profile: ProfileJson
): { primary: string; terms: string[] }[] {
  const result: { primary: string; terms: string[] }[] = [];
  for (const work of profile.active_work) {
    const terms: string[] = [work.name.toLowerCase()];
    if (work.aliases) {
      for (const alias of work.aliases) terms.push(alias.toLowerCase());
    }
    const descTerms = work.description
      .split(/[,.]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 3 && t.length < 40);
    for (const dt of descTerms) terms.push(dt.toLowerCase());
    result.push({ primary: work.name, terms: [...new Set(terms)] });
  }
  return result;
}

function matchGeoCurrent(
  corpus: string,
  currentCity: string | KeywordWithAliases
): string[] {
  const matches: string[] = [];
  const primary = getPrimary(currentCity);
  const allTerms = expandKeyword(currentCity);
  for (const term of allTerms) {
    if (matchesKeyword(corpus, term)) matches.push(term);
  }
  const cityStateMap: Record<string, string[]> = {
    bangalore: ["karnataka", "bengaluru"],
    bengaluru: ["karnataka", "bangalore"],
    mumbai: ["maharashtra", "bombay"],
    delhi: ["ncr", "new delhi"],
    hyderabad: ["telangana"],
    chennai: ["tamil nadu"],
    pune: ["maharashtra"],
    kolkata: ["west bengal"],
    gurgaon: ["haryana", "gurugram"],
  };
  const cityLower = primary.toLowerCase().split(",")[0].trim();
  const stateTerms = cityStateMap[cityLower] || [];
  for (const term of stateTerms) {
    if (matchesKeyword(corpus, term)) matches.push(term);
  }
  if (matches.length === 0 && matchesKeyword(corpus, "India")) {
    matches.push("India");
  }
  return [...new Set(matches)];
}

function matchGeoHometown(
  corpus: string,
  hometown: string | KeywordWithAliases
): string[] {
  const matches: string[] = [];
  const allTerms = expandKeyword(hometown);
  const primary = getPrimary(hometown);
  const parts = primary.split(/[,\s]+/).filter((p) => p.length > 2).map((p) => p.toLowerCase());
  const allToCheck = [...new Set([...allTerms, ...parts])];
  for (const term of allToCheck) {
    if (matchesKeyword(corpus, term)) matches.push(term);
  }
  return [...new Set(matches)];
}

const NOISE_INDICATORS = [
  "bollywood", "celebrity", "actor", "actress", "movie release", "film star",
  "cricket match", "ipl", "cricket tournament", "world cup cricket",
  "wins award", "birthday", "wedding", "divorce", "personal life",
  "viral video", "social media trend", "meme",
  "murder", "robbery", "accident", "arrested for",
  "horoscope", "zodiac", "astrology", "numerology",
];

/**
 * Detect negative signals that indicate an article is noise,
 * even if it keyword-matches profile terms.
 */
export function detectNegativeSignals(article: {
  title: string;
  summary: string | null;
}): string[] {
  const text = `${article.title} ${article.summary || ""}`.toLowerCase();
  const detected: string[] = [];
  for (const indicator of NOISE_INDICATORS) {
    if (text.includes(indicator)) detected.push(indicator);
  }
  return detected;
}

/**
 * Compute multi-dimensional context matches for an article against a user profile.
 * Uses alias expansion for all keyword arrays.
 */
export function computeMatchedContext(
  article: NewsPoolItem,
  profile: ProfileJson
): MatchedContext {
  const corpus = buildCorpus(article);
  const vip_matches = matchWithAliases(corpus, profile.vip_entities);
  const workEntries = extractWorkKeywordsExpanded(profile);
  const work_matches: string[] = [];
  for (const entry of workEntries) {
    if (entry.terms.some((term) => matchesKeyword(corpus, term)) && !work_matches.includes(entry.primary)) {
      work_matches.push(entry.primary);
    }
  }
  const financial_matches = matchWithAliases(corpus, profile.financial_interests);
  const interest_matches = matchWithAliases(corpus, profile.personal_interests);
  const geo_current_matches = matchGeoCurrent(corpus, profile.locations.current_city);
  const geo_hometown_matches = matchGeoHometown(corpus, profile.locations.hometown);
  const hobby_matches = matchWithAliases(corpus, profile.hobbies);
  return {
    vip_matches, work_matches, financial_matches,
    geo_current_matches, geo_hometown_matches, interest_matches, hobby_matches,
  };
}
