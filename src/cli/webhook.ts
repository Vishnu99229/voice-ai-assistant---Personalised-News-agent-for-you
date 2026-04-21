delete process.env.OPENAI_API_KEY;

import "dotenv/config";
import http from "node:http";

const PORT = Number(process.env.WEBHOOK_PORT) || 3456;

/**
 * Vapi.ai webhook server.
 * - POST /webhook  → parse JSON, log structured event, respond 200 immediately
 * - GET  /health   → respond 200 "healthy"
 * - Everything else → 404
 */
const server = http.createServer((req, res) => {
  // ── Health check ──────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("healthy");
    return;
  }

  // ── Vapi webhook endpoint ─────────────────────────────────────────
  if (req.method === "POST" && req.url === "/webhook") {
    // Respond 200 immediately so Vapi never times out
    res.writeHead(200);
    res.end("ok");

    // Collect body asynchronously (after response is already sent)
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);

        const eventType = data.type ?? "unknown";
        const callId = data.call_id ?? "N/A";

        console.log("\n[WEBHOOK EVENT]");
        console.log(`type: ${eventType}`);
        console.log(`callId: ${callId}`);
        console.log(`Payload: ${JSON.stringify(data)}`);
      } catch {
        console.error("\nInvalid JSON received");
        console.error(`Raw body: ${body}`);
      }
    });
    return;
  }

  // ── Fallback — 404 ───────────────────────────────────────────────
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   🔗 VAPI WEBHOOK SERVER RUNNING       ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n🌐 Listening on http://localhost:${PORT}`);
  console.log(`📌 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`❤️  Health check:     http://localhost:${PORT}/health\n`);

  if (process.env.WEBHOOK_URL) {
    console.log(`🔗 Public URL (ngrok): ${process.env.WEBHOOK_URL}/webhook\n`);
  } else {
    console.log("💡 Set WEBHOOK_URL in .env once you start ngrok\n");
  }
});
