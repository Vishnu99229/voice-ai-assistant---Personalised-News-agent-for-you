import { rankArticles } from "../rank/rank.js";

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: npm run rank -- <userId>");
    console.error("  Get your userId from: npm run seed");
    process.exit(1);
  }

  console.log(`🚀 Starting ranking for user ${userId}…\n`);
  const start = Date.now();

  try {
    const result = await rankArticles(userId);
    console.log(`\n📊 Selected ${result.selected.length} articles (score >= 6)`);
    console.log(`   Total scored: ${result.debug.length}`);
  } catch (err) {
    console.error("❌ Ranking failed:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱ Ranking completed in ${elapsed}s`);
}

main();
