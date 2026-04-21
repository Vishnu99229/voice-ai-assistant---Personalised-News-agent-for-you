import type { MatchedContext, ProfileJson, TriggerType } from "../types.js";

/**
 * Determine trigger_type based on match context.
 * Priority: VIP → Work → Financial → Geo → Hobby → Learning
 */
export function classifyTrigger(matches: MatchedContext): TriggerType {
  if (matches.vip_matches.length > 0) return "outreach_hook";
  if (matches.work_matches.length > 0) return "outreach_hook";
  if (matches.financial_matches.length > 0) return "market_signal";
  if (
    matches.geo_current_matches.length > 0 ||
    matches.geo_hometown_matches.length > 0
  )
    return "local_relevance";
  if (matches.hobby_matches.length > 0) return "lifestyle";
  if (matches.interest_matches.length > 0) return "learning";
  return "learning";
}

/**
 * Build a factual, single-sentence "why relevant" string.
 * Follows strict priority: Work > Financial > Current city > Hometown > Hobby.
 * Does NOT combine unrelated signals. Does NOT invent connections.
 */
export function buildWhyRelevant(
  matches: MatchedContext,
  profile: ProfileJson
): string {
  // VIP entity — most specific and actionable
  if (matches.vip_matches.length > 0) {
    const entity = matches.vip_matches[0];
    // Try to find which active_work this VIP relates to
    const relatedWork = profile.active_work.find(
      (w) =>
        w.description.toLowerCase().includes(entity.toLowerCase()) ||
        w.name.toLowerCase().includes(entity.toLowerCase()) ||
        w.why_news_matters.toLowerCase().includes(entity.toLowerCase())
    );

    if (relatedWork) {
      return `Relevant because ${entity} is connected to your ${relatedWork.name} work — ${relatedWork.why_news_matters.split(".")[0].toLowerCase()}.`;
    }
    return `Relevant because ${entity} is on your VIP watchlist.`;
  }

  // Work match — outreach hooks
  if (matches.work_matches.length > 0) {
    const workTerm = matches.work_matches[0];
    const relatedWork = profile.active_work.find(
      (w) =>
        w.name.toLowerCase() === workTerm.toLowerCase() ||
        w.description.toLowerCase().includes(workTerm.toLowerCase())
    );

    if (relatedWork) {
      return `Relevant because this relates to your ${relatedWork.name} work — could be an outreach hook or talking point.`;
    }
    return `Relevant because this touches on your active work in ${workTerm}.`;
  }

  // Financial match
  if (matches.financial_matches.length > 0) {
    const interest = matches.financial_matches[0];
    return `Relevant because this reflects current ${interest.toLowerCase()} trends tied to your financial interests.`;
  }

  // Interest match (before geo, since it's weighted higher)
  if (matches.interest_matches.length > 0) {
    const interest = matches.interest_matches[0];
    return `Relevant given your interest in ${interest.toLowerCase()}.`;
  }

  // Current city geo
  if (matches.geo_current_matches.length > 0) {
    const geo = matches.geo_current_matches[0];
    if (geo.toLowerCase() === "india") {
      return `Relevant as this is an India-wide development in the ecosystem you operate in.`;
    }
    return `Relevant as this directly impacts the ${geo} ecosystem you operate in.`;
  }

  // Hometown geo
  if (matches.geo_hometown_matches.length > 0) {
    const geo = matches.geo_hometown_matches[0];
    return `Relevant as this is a ${geo}-specific development, which connects to your hometown.`;
  }

  // Hobby — only when direct
  if (matches.hobby_matches.length > 0) {
    const hobby = matches.hobby_matches[0];
    return `Relevant given your interest in ${hobby}, as this directly relates to that activity.`;
  }

  return "General news item with potential relevance.";
}
