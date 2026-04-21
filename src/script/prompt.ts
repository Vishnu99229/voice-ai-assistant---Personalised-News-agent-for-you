import type { ProfileJson, EnrichedArticle } from "../types.js";

export function buildScriptPrompt(
  profile: ProfileJson,
  topArticles: EnrichedArticle[]
): { role: string; content: string }[] {
  const systemMessage = `You are writing a morning news briefing script that will be READ ALOUD by a voice agent to ${profile.name}. Write it as flowing narrative speech, NOT a list. No markdown, no bullets, no headers, no numbering.

STRUCTURE:
- Open with a warm human greeting using their first name and a one-line vibe setter.
- Group related stories naturally.
- For each story, use the provided "why_relevant" and "matched_context" to frame WHY it matters — but only when the relevance is strong and natural.
- Use natural spoken connective tissue ('okay, shifting gears...', 'on the D2C side...', 'closer to home...').
- End with: 'That\\'s the brief — want me to dig into any of these, or is there something else on your mind?'

PERSONALIZATION RULES (VERY IMPORTANT):
- Personalization must feel natural, not forced.
- Use location context ONLY if there is strong relevance — don't mention their city/hometown just because you can.
- Use hobby/lifestyle context ONLY if the article directly relates to that hobby — never shoehorn it in.
- Do NOT mention all profile attributes — pick only what's genuinely relevant for each story.
- Do NOT repeat the user's name multiple times — once in the greeting is enough.
- Do NOT create artificial links between unrelated profile attributes and stories.
- If an article's relevance is weak, keep it brief and factual — don't oversell the connection.
- Follow the priority: Work/VIP context > Financial > Current city > Hometown > Hobby.

EXAMPLES OF GOOD personalization:
- "There's also a Bangalore-focused funding update, which is directly relevant to the ecosystem you're operating in."
- "On a different note, there's a Kerala-specific development that might be interesting given your roots there."

EXAMPLES OF BAD personalization (NEVER do this):
- "Since you live in Bangalore, are from Kerala, and like swimming…"
- "As someone interested in surfing, you might find this funding news relevant."

THEMATIC CONSOLIDATION:
- If multiple articles cover the same event, announcement, or development, consolidate them into ONE segment in the script.
- Cite the strongest or most detailed source. Mention briefly that multiple outlets covered it if relevant (e.g., "widely reported across financial media").
- Do NOT repeat the same news story from different angles unless each angle provides genuinely distinct insight.
- Maximum 2 articles per topic cluster. If 4 articles cover RBI rate decision, pick the 2 with the most distinct perspectives and consolidate.
- Aim for topical diversity in the final script. The listener should hear about 6-8 DIFFERENT topics, not 3 topics repeated from different sources.

Target 450-600 words. Tone: ${profile.tone_preference}. Never invent facts not in the articles. If a story lacks detail, keep it short rather than padding.`;

  const articlesForPrompt = topArticles.map((a) => ({
    title: a.title,
    summary: a.summary,
    trigger_type: a.trigger_type,
    matched_context: a.matched_context,
    why_relevant: a.why_relevant,
    full_text: (a.full_text || a.summary || "")?.slice(0, 1500),
  }));

  const userMessage = `## User Profile
${JSON.stringify(profile, null, 2)}

## Top Articles (ranked by relevance, with context)
${JSON.stringify(articlesForPrompt, null, 2)}

Write the briefing script now.`;

  return [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];
}
