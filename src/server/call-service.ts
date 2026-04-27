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

  const selectedArticles = Array.isArray(briefing.selected_articles_json)
    ? briefing.selected_articles_json
    : [];

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
        article_count: selectedArticles.length.toString(),
      },
    },
  };

  const callResponse = await axios.post("https://api.vapi.ai/call/phone", callPayload, {
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  console.log(`[CALL-SERVICE] Call triggered for ${profile.name}: ${callResponse.data.id}`);

  return {
    callId: callResponse.data.id,
    briefingWords: briefing.briefing_script.trim().split(/\s+/).length,
  };
}
