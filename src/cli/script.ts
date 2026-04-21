import { rankArticles } from "../rank/rank.js";
import { generateScript } from "../script/generate.js";

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: npm run script -- <userId>");
    console.error("  Get your userId from: npm run seed");
    process.exit(1);
  }

  console.log(`🚀 Starting script generation for user ${userId}…\n`);
  const start = Date.now();

  try {
    // Rank first (script needs ranked articles)
    const { selected, debug } = await rankArticles(userId);

    if (selected.length === 0) {
      console.log("\n⚠ No articles scored high enough. Run ingest first.");
      process.exit(0);
    }

    // Generate script
    await generateScript(userId, selected, debug);
  } catch (err) {
    console.error("❌ Script generation failed:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱ Script generation completed in ${elapsed}s`);
}

main();
