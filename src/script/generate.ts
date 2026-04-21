import OpenAI from "openai";
import "dotenv/config";
import { supabase } from "../db/client.js";
import { buildScriptPrompt } from "./prompt.js";
import type { EnrichedArticle, ScoredArticleDebug, User } from "../types.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate the briefing script from enriched ranked articles and save to daily_briefing.
 */
export async function generateScript(
  userId: string,
  selectedArticles: EnrichedArticle[],
  rankingDebug: ScoredArticleDebug[]
): Promise<string> {
  console.log("\n═══════════════════════════════════════");
  console.log("  ✍️  SCRIPT GENERATION");
  console.log("═══════════════════════════════════════\n");

  if (selectedArticles.length === 0) {
    console.log("⚠ No articles to generate a script from.");
    return "";
  }

  // Load user profile
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (userErr || !user) {
    throw new Error(`User not found: ${userErr?.message || "no data"}`);
  }

  const typedUser = user as User;

  console.log(`📝 Generating script for ${typedUser.profile_json.name}…`);
  console.log(`   Using ${selectedArticles.length} articles`);

  // Log trigger type distribution
  const triggerCounts = selectedArticles.reduce(
    (acc, a) => {
      acc[a.trigger_type] = (acc[a.trigger_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log(
    `   Triggers: ${Object.entries(triggerCounts)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ")}\n`
  );

  const messages = buildScriptPrompt(
    typedUser.profile_json,
    selectedArticles
  );

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages as any,
    temperature: 0.6,
    max_tokens: 1500,
  });

  const script = response.choices[0]?.message?.content;
  if (!script) {
    throw new Error("LLM returned empty script");
  }

  // Save to daily_briefing
  const today = new Date().toISOString().split("T")[0];

  const { error: upsertErr } = await supabase.from("daily_briefing").upsert(
    {
      user_id: userId,
      briefing_date: today,
      briefing_script: script,
      selected_articles_json: selectedArticles,
      ranking_debug_json: rankingDebug,
    },
    { onConflict: "user_id,briefing_date" }
  );

  if (upsertErr) {
    console.error(`❌ Failed to save briefing: ${upsertErr.message}`);
  } else {
    console.log(`✅ Briefing saved to daily_briefing for ${today}`);
  }

  // Print the full script
  console.log("\n───────────────────────────────────────");
  console.log("  📻 MORNING BRIEFING SCRIPT");
  console.log("───────────────────────────────────────\n");
  console.log(script);
  console.log("\n───────────────────────────────────────\n");

  const wordCount = script.split(/\s+/).length;
  console.log(`📊 Word count: ${wordCount}`);

  return script;
}
