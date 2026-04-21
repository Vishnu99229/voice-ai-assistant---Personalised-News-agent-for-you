delete process.env.OPENAI_API_KEY;

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function triggerCall(userId: string) {
  const today = new Date().toISOString().split("T")[0];

  // 1. Fetch today's briefing
  const { data: briefing, error: briefingError } = await supabase
    .from("daily_briefing")
    .select("briefing_script, selected_articles_json")
    .eq("user_id", userId)
    .eq("briefing_date", today)
    .single();

  if (briefingError || !briefing) {
    console.error("❌ No briefing found for today. Run: npm run daily -- <userId> first.");
    process.exit(1);
  }

  // 2. Fetch user
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("phone, profile_json")
    .eq("id", userId)
    .single();

  if (userError || !user?.phone) {
    console.error("❌ No user or phone number found for userId:", userId);
    process.exit(1);
  }

  const profile = user.profile_json as any;

  // 3. Safety check — briefing must exist
  if (!briefing.briefing_script || briefing.briefing_script.length < 50) {
    console.error("❌ Briefing script is too short or empty. Re-run npm run script -- <userId>");
    process.exit(1);
  }

  console.log(`\n📞 Triggering call to ${profile.name} at ${user.phone}`);
  console.log(`📋 Briefing length: ${briefing.briefing_script.length} characters`);
  console.log(`📰 Articles loaded: ${(briefing.selected_articles_json as any[]).length}`);

  // 4. Trigger Vapi outbound call
  const payload = {
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
        article_count: (briefing.selected_articles_json as any[]).length.toString(),
      },
    },
  };

  try {
    const response = await axios.post(
      "https://api.vapi.ai/call/phone",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("\n✅ Call triggered successfully!");
    console.log(`Call ID:   ${response.data.id}`);
    console.log(`Status:    ${response.data.status}`);
    console.log(`To:        ${user.phone}`);
    console.log(`\n👂 Your phone should ring within 10-15 seconds.`);
    console.log(`📡 Watch webhook logs for: call.started → speech.started → transcript → call.ended`);
  } catch (err: any) {
    if (err.response) {
      console.error("\n❌ Vapi API error:");
      console.error("Status:", err.response.status);
      console.error("Body:", JSON.stringify(err.response.data, null, 2));

      if (err.response.status === 400) {
        console.error("\n💡 Common causes: wrong phoneNumberId, assistantId, or phone number format (+91XXXXXXXXXX)");
      }
      if (err.response.status === 401) {
        console.error("\n💡 Check VAPI_API_KEY in your .env");
      }
      if (err.response.status === 402) {
        console.error("\n💡 Vapi credits are low — top up at dashboard.vapi.ai");
      }
    } else {
      console.error("\n❌ Network error:", err.message);
    }
    process.exit(1);
  }
}

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: npm run call -- <userId>");
  console.error("Example: npm run call -- a1b2c3d4-...");
  process.exit(1);
}

triggerCall(userId);
