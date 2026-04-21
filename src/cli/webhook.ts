delete process.env.OPENAI_API_KEY;

import "dotenv/config";
import http from "node:http";

const PORT = Number(process.env.WEBHOOK_PORT) || 3456;

/**
 * Minimal webhook server for Vapi.ai.
 * Listens for incoming POST requests on /webhook and responds with 200.
 */
const server = http.createServer((req, res) => {
  // Health-check / ping
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Vapi webhook endpoint
  if (req.method === "POST" && req.url === "/webhook") {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        console.log(`📩 Webhook received [${new Date().toISOString()}]`);
        console.log(`   Type: ${payload.message?.type ?? "unknown"}`);
        console.log(`   Payload keys: ${Object.keys(payload).join(", ")}\n`);

        // TODO: Route specific Vapi event types here
        // e.g. "end-of-call-report", "function-call", "assistant-request"

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("⚠ Failed to parse webhook body:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // Fallback — 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
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
