import { runIngest } from "../ingest/index.js";
import { rankArticles } from "../rank/rank.js";
import { generateScript } from "../script/generate.js";

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: npm run daily -- <userId>");
    console.error("  Get your userId from: npm run seed");
    process.exit(1);
  }

  console.log("╔═══════════════════════════════════════╗");
  console.log("║   🌅 MORNING BRIEF — DAILY PIPELINE   ║");
  console.log("╚═══════════════════════════════════════╝\n");

  const start = Date.now();

  try {
    // Step 1: Ingest
    await runIngest();

    // Step 2: Rank
    const { selected, debug } = await rankArticles(userId);

    if (selected.length === 0) {
      console.log("\n⚠ No articles scored high enough. Pipeline complete but no script generated.");
      process.exit(0);
    }

    // Step 3: Generate script
    await generateScript(userId, selected, debug);
  } catch (err) {
    console.error("❌ Pipeline failed:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🏁 Full pipeline completed in ${elapsed}s`);
}

main();
