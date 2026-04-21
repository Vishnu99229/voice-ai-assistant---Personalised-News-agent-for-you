import { supabase } from "./client.js";
import type { ProfileJson } from "../types.js";

const profile: ProfileJson = {
  name: "Vishnu",
  role_context:
    "Independent GTM consultant based in Bangalore running B2B outreach and pipeline development for two clients: Arrowhead.ai (voice AI startup) and eShipz (multi-courier shipping platform for Indian D2C brands).",
  active_work: [
    {
      name: "Arrowhead.ai",
      description:
        "Voice AI startup, Stellaris-backed. Targeting aviation, e-commerce, insurance, health tech.",
      why_news_matters:
        "News on voice AI competitors, airline digital transformation, and target prospects like IndiGo gives him outreach hooks and talking points for demos.",
      aliases: ["arrowhead", "arrowhead voice ai"],
    },
    {
      name: "eShipz",
      description:
        "Multi-courier shipping orchestration for D2C brands in fashion, beauty, home.",
      why_news_matters:
        "D2C brand funding, logistics news, and marketplace shifts are direct outreach triggers.",
      aliases: ["eshipz logistics", "eshipz shipping"],
    },
  ],
  personal_interests: [
    { primary: "voice AI industry", aliases: ["conversational ai", "speech ai", "voice assistant", "voice bot"] },
    { primary: "AI agent tooling", aliases: ["ai agents", "agentic ai", "autonomous agents", "agent framework"] },
    "build-in-public creators",
    { primary: "n8n and automation", aliases: ["n8n", "workflow automation", "no-code automation"] },
  ],
  locations: {
    current_city: {
      primary: "Bangalore",
      aliases: ["bengaluru", "garden city", "koramangala", "indiranagar", "hsr layout", "whitefield", "electronic city", "marathahalli"],
    },
    hometown: {
      primary: "Alappuzha",
      aliases: ["alleppey", "alappuzha district", "kuttanad", "kerala"],
    },
  },
  financial_interests: [
    { primary: "Indian startup funding", aliases: ["india funding round", "seed round india", "series a india", "startup fundraise"] },
    { primary: "SaaS metrics", aliases: ["saas revenue", "arr", "net revenue retention", "saas growth"] },
    { primary: "D2C market trends", aliases: ["direct to consumer", "d2c funding", "d2c startups", "d2c brands"] },
  ],
  hobbies: [
    { primary: "surfing", aliases: ["wave conditions", "swells", "surf spots", "board sports", "surf season"] },
    { primary: "swimming", aliases: ["aquatics", "open water swimming"] },
  ],
  tone_preference:
    "Warm, direct, slightly informal -- like a sharp friend who read the news for you. No corporate hedging.",
  explicit_filters: [
    "celebrity gossip",
    "cricket scores unless major",
    "generic politics",
  ],
  vip_entities: [
    { primary: "Neetan Chopra", aliases: ["neetan"] },
    { primary: "IndiGo", aliases: ["indigo airlines", "interglobe aviation"] },
    "Devyani Gupta",
    { primary: "Stellaris", aliases: ["stellaris venture partners"] },
    "Urban Space",
    "Bacca Bucci",
    "Neemans",
    "Farmley",
    "WhatsApp Wellness",
    { primary: "Vodex", aliases: ["vodex.ai"] },
    { primary: "Arrowhead.ai", aliases: ["arrowhead"] },
    { primary: "eShipz", aliases: ["eshipz.com"] },
    { primary: "Swiggy", aliases: ["swiggy instamart", "sriharsha majety"] },
    { primary: "Zomato", aliases: ["blinkit", "deepinder goyal", "hyperpure"] },
    { primary: "ONDC", aliases: ["open network for digital commerce"] },
  ],
};

async function seed() {
  console.log("Seeding test user...");

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        email: "vishnu@test.local",
        phone: "+91XXXXXXXXXX",
        timezone: "Asia/Kolkata",
        preferred_call_time: "08:00",
        profile_json: profile,
      },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`User seeded -- id: ${data.id}`);
  console.log("   Save this ID to run:  npm run daily -- <userId>");
}

seed();
