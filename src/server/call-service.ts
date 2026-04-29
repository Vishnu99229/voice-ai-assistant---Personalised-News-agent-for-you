import axios from "axios";
import "dotenv/config";
import { supabase } from "../db/client.js";
import { rankArticles } from "../rank/rank.js";
import { generateScript } from "../script/generate.js";

interface CallResult {
  callId?: string;
  briefingWords?: number;
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

async function ensureFreshNewsPool() {
  // Auto-ingest if news pool is stale.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentArticles } = await supabase
    .from("news_pool")
    .select("id")
    .gte("fetched_at", oneHourAgo)
    .limit(1);

  if (!recentArticles || recentArticles.length === 0) {
    console.log("[CALL-SERVICE] News pool is stale - running ingest...");
    try {
      const { execSync } = await import("node:child_process");
      execSync("npx tsx src/cli/ingest.ts", {
        cwd: process.cwd(),
        timeout: 120000,
        stdio: "pipe",
      });
      console.log("[CALL-SERVICE] Ingest completed");
    } catch (ingestErr: any) {
      console.error("[CALL-SERVICE] Ingest failed:", ingestErr.message);
      // Continue anyway - there might still be articles from the last 30 hours.
    }
  }
}

async function getOrCreateBriefing(userId: string) {
  const today = todayIsoDate();
  const { data: existingBriefing, error: existingErr } = await supabase
    .from("daily_briefing")
    .select("briefing_script, selected_articles_json")
    .eq("user_id", userId)
    .eq("briefing_date", today)
    .maybeSingle();

  if (existingErr) {
    throw new Error("Failed to fetch existing briefing: " + existingErr.message);
  }

  if (existingBriefing) {
    console.log(`[CALL-SERVICE] Using existing briefing for ${userId} (${today})`);
    return existingBriefing;
  }

  console.log(`[CALL-SERVICE] No briefing for ${userId} (${today}); generating one`);
  await ensureFreshNewsPool();
  const { selected, debug } = await rankArticles(userId);
  if (selected.length === 0) {
    throw new Error("No relevant articles found for this user profile. Run ingest first or adjust the profile.");
  }

  const briefingScript = await generateScript(userId, selected, debug);
  if (!briefingScript) {
    throw new Error("Briefing generation returned an empty script.");
  }

  return {
    briefing_script: briefingScript,
    selected_articles_json: selected,
  };
}

export async function triggerCallForUser(userId: string): Promise<CallResult> {
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (userErr || !user) throw new Error("User not found: " + userId);
  if (user.status !== "active") throw new Error("User is not active: " + (user.status || "unknown"));
  if (!user.phone) throw new Error("User has no phone number");
  if (!user.profile_json?.name) throw new Error("User has no profile_json");

  const profile = user.profile_json;
  const briefing = await getOrCreateBriefing(userId);

  if (!briefing.briefing_script || briefing.briefing_script.length < 50) {
    throw new Error("Briefing script is too short or empty.");
  }

  // 7. Trigger Vapi call
  const callPayload = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    assistantId: process.env.VAPI_ASSISTANT_ID,
    customer: {
      number: user.phone,
      name: profile.name,
    },
    assistantOverrides: {
      variableValues: {
        name: profile.name,
        briefing_script: briefing.briefing_script,
        profile_context: JSON.stringify({
          role_context: profile.role_context,
          active_work: profile.active_work,
          vip_entities: profile.vip_entities,
          tone_preference: profile.tone_preference,
        }),
      },
    },
  };

  try {
    const callResponse = await axios.post(
      "https://api.vapi.ai/call/phone",
      callPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log(`[CALL-SERVICE] Call triggered for ${profile.name}: ${callResponse.data.id}`);

    return {
      callId: callResponse.data.id,
      briefingWords: briefing.briefing_script.split(/\s+/).length,
    };
  } catch (callErr: any) {
    const errBody = callErr.response?.data ? JSON.stringify(callErr.response.data) : callErr.message;
    console.error(`[CALL-SERVICE] Vapi call failed for ${profile.name}:`);
    console.error(`[CALL-SERVICE] Status: ${callErr.response?.status}`);
    console.error(`[CALL-SERVICE] Body: ${errBody}`);
    console.error(`[CALL-SERVICE] Phone: ${user.phone}`);
    console.error(`[CALL-SERVICE] PhoneNumberId: ${process.env.VAPI_PHONE_NUMBER_ID}`);
    throw new Error(`Vapi call failed (${callErr.response?.status}): ${errBody}`);
  }
}
