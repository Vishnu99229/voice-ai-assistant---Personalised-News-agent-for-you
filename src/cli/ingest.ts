import { runIngest } from "../ingest/index.js";

async function main() {
  console.log("🚀 Starting ingest pipeline…\n");
  const start = Date.now();

  try {
    await runIngest();
  } catch (err) {
    console.error("❌ Ingest failed:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱ Ingest completed in ${elapsed}s`);
}

main();
