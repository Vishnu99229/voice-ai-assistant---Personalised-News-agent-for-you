import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import "dotenv/config";
import { triggerCallForUser } from "./call-service.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "morningbrief2026";
const ADMIN_TOKEN = Buffer.from(ADMIN_PASSWORD + ":admin-secret").toString("base64");
const CRON_SECRET = process.env.CRON_SECRET || "cron-secret-default";

function parseBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        req.destroy(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(body));
      } catch {
        resolveBody({});
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serveFile(res: ServerResponse, filename: string, contentType: string) {
  try {
    const filePath = resolve(process.cwd(), "src/public", filename);
    const content = readFileSync(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

function headerValue(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function checkAuth(req: IncomingMessage): boolean {
  return headerValue(req, "authorization") === "Bearer " + ADMIN_TOKEN;
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => requiredString(item)).filter(Boolean);
}

function buildProfileFromLlm(rawProfile: Record<string, any>, formData: Record<string, any>) {
  const name = requiredString(rawProfile.name) || requiredString(formData.name);
  const city = requiredString(formData.city);
  const locations = rawProfile.locations && !Array.isArray(rawProfile.locations)
    ? rawProfile.locations
    : {};

  return {
    name,
    role_context: requiredString(rawProfile.role_context) || requiredString(formData.role),
    active_work: Array.isArray(rawProfile.active_work) && rawProfile.active_work.length > 0
      ? rawProfile.active_work.map((work: any) => ({
        name: requiredString(work.name) || "Current work",
        description: requiredString(work.description) || requiredString(formData.role),
        why_news_matters: requiredString(work.why_news_matters) || "Relevant updates may affect their work and decisions.",
        aliases: normalizeStringArray(work.aliases),
      }))
      : [{
        name: "Current work",
        description: requiredString(formData.role),
        why_news_matters: "Relevant updates may affect their work and decisions.",
        aliases: [],
      }],
    personal_interests: normalizeStringArray(rawProfile.personal_interests).length > 0
      ? normalizeStringArray(rawProfile.personal_interests)
      : normalizeStringArray(formData.topics),
    locations: {
      current_city: requiredString(locations.current_city) || city || "India",
      hometown: requiredString(locations.hometown) || city || "India",
    },
    financial_interests: normalizeStringArray(rawProfile.financial_interests),
    hobbies: normalizeStringArray(rawProfile.hobbies),
    tone_preference: requiredString(rawProfile.tone_preference) || "warm, direct, slightly informal",
    explicit_filters: normalizeStringArray(rawProfile.explicit_filters).length > 0
      ? normalizeStringArray(rawProfile.explicit_filters)
      : ["celebrity gossip"],
    vip_entities: normalizeStringArray(rawProfile.vip_entities),
  };
}

async function generateProfile(formData: Record<string, any>) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Convert raw waitlist form data into a structured profile_json for a personalized news briefing AI agent. Output MUST be valid JSON matching this schema:

{
  "name": "string",
  "role_context": "1-2 sentence description of what they do and why news matters to them",
  "active_work": [{"name": "string", "description": "string", "why_news_matters": "string", "aliases": ["string"]}],
  "personal_interests": ["string"],
  "locations": {"current_city": "string", "hometown": "string"},
  "financial_interests": ["string"],
  "hobbies": ["string"],
  "tone_preference": "warm, direct, slightly informal",
  "explicit_filters": ["celebrity gossip"],
  "vip_entities": ["string"]
}

Rules:
- Use the role description to infer 1-2 active_work entries.
- Each active_work entry must include why_news_matters explaining what kind of news is actionable for them.
- Use topics_selected or topics for personal_interests.
- Use specific_flags to populate vip_entities by extracting named people, companies, products, and places.
- Use city for locations.current_city and locations.hometown if no hometown is provided; add India context only in values if natural.
- Always include "celebrity gossip" in explicit_filters unless topics suggest otherwise.
- Infer financial_interests from the role where possible.
- tone_preference is always "warm, direct, slightly informal".
- Be specific and concrete, not generic.`
      },
      {
        role: "user",
        content: JSON.stringify(formData),
      },
    ],
    temperature: 0.4,
  });

  const rawProfile = JSON.parse(completion.choices[0].message.content || "{}");
  return buildProfileFromLlm(rawProfile, formData);
}

function getRoutePath(req: IncomingMessage): string {
  return new URL(req.url || "/", "http://localhost").pathname;
}

export async function handleRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = getRoutePath(req);
  const method = req.method || "";

  if (method === "GET" && (path === "/" || path === "/index.html")) {
    serveFile(res, "index.html", "text/html; charset=utf-8");
    return true;
  }

  if (method === "GET" && (path === "/admin" || path === "/admin.html")) {
    serveFile(res, "admin.html", "text/html; charset=utf-8");
    return true;
  }

  if (method === "POST" && path === "/api/signup") {
    const body = await parseBody(req);
    const name = requiredString(body.name);
    const email = requiredString(body.email).toLowerCase();
    const phone = requiredString(body.phone);
    const role = requiredString(body.role);
    const callTime = requiredString(body.call_time);

    if (!name || !email || !phone || !role || !callTime || body.consent !== true) {
      json(res, 400, { error: "Please fill in all required fields." });
      return true;
    }

    if (!/^\+\d{10,15}$/.test(phone)) {
      json(res, 400, { error: "Phone number must be in international format, e.g. +919880622570" });
      return true;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(res, 400, { error: "Please enter a valid email address." });
      return true;
    }

    if (!/^\d{2}:\d{2}$/.test(callTime)) {
      json(res, 400, { error: "Please choose a valid call time." });
      return true;
    }

    const { data: existingByEmail, error: emailErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .limit(1);

    const { data: existingByPhone, error: phoneErr } = await supabase
      .from("users")
      .select("id")
      .eq("phone", phone)
      .limit(1);

    if (emailErr || phoneErr) {
      console.error("[SIGNUP] Duplicate check error:", emailErr || phoneErr);
      json(res, 500, { error: "Something went wrong. Please try again." });
      return true;
    }

    if ((existingByEmail && existingByEmail.length > 0) || (existingByPhone && existingByPhone.length > 0)) {
      json(res, 409, { error: "You're already on the waitlist! We'll be in touch soon." });
      return true;
    }

    const formData = {
      name,
      email,
      phone,
      city: requiredString(body.city),
      role,
      topics: normalizeStringArray(body.topics),
      specific_flags: requiredString(body.specific_flags),
      call_time: callTime,
      consent: true,
    };

    const { data, error } = await supabase
      .from("users")
      .insert({
        email,
        phone,
        name,
        timezone: "Asia/Kolkata",
        preferred_call_time: callTime,
        status: "pending",
        form_data_json: formData,
        profile_json: {},
      })
      .select("id")
      .single();

    if (error) {
      console.error("[SIGNUP] DB error:", error);
      json(res, 500, { error: "Something went wrong. Please try again." });
      return true;
    }

    console.log(`[SIGNUP] New waitlist entry: ${name} (${email}) - ${data.id}`);
    json(res, 201, { success: true, id: data.id });
    return true;
  }

  if (method === "POST" && path === "/api/admin/login") {
    const body = await parseBody(req);
    if (body.password === ADMIN_PASSWORD) {
      json(res, 200, { token: ADMIN_TOKEN });
    } else {
      json(res, 401, { error: "Invalid password" });
    }
    return true;
  }

  if (method === "GET" && path === "/api/admin/users") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, email, phone, name, status, preferred_call_time, form_data_json, profile_json, approved_at, last_called_date, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN] Users query error:", error);
      json(res, 500, { error: "Failed to load users." });
      return true;
    }

    json(res, 200, data || []);
    return true;
  }

  if (method === "POST" && path === "/api/admin/approve") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }

    const body = await parseBody(req);
    const userId = requiredString(body.userId);
    if (!userId) {
      json(res, 400, { error: "userId required" });
      return true;
    }

    const { data: user, error: fetchErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (fetchErr || !user) {
      json(res, 404, { error: "User not found" });
      return true;
    }

    const formData = user.form_data_json || {};

    try {
      const profileJson = await generateProfile(formData);
      const { error: updateErr } = await supabase
        .from("users")
        .update({
          status: "active",
          approved_at: new Date().toISOString(),
          profile_json: profileJson,
          name: profileJson.name,
        })
        .eq("id", userId);

      if (updateErr) {
        console.error("[APPROVE] Update error:", updateErr);
        json(res, 500, { error: "Failed to update user." });
        return true;
      }

      console.log(`[APPROVE] User activated: ${profileJson.name} (${userId})`);
      json(res, 200, { success: true, profile: profileJson });
    } catch (err: any) {
      console.error("[APPROVE] LLM error:", err.message);
      json(res, 500, { error: "Failed to generate profile: " + err.message });
    }
    return true;
  }

  if (method === "POST" && path === "/api/admin/reject") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }

    const body = await parseBody(req);
    const userId = requiredString(body.userId);
    if (!userId) {
      json(res, 400, { error: "userId required" });
      return true;
    }

    const { error } = await supabase
      .from("users")
      .update({ status: "rejected" })
      .eq("id", userId);

    if (error) {
      console.error("[ADMIN] Reject error:", error);
      json(res, 500, { error: "Failed to reject user." });
      return true;
    }

    json(res, 200, { success: true });
    return true;
  }

  // API: Pause user (stops daily calls but keeps profile)
  if (method === "POST" && path === "/api/admin/pause") {
    if (!checkAuth(req)) { json(res, 401, { error: "Unauthorized" }); return true; }
    const body = await parseBody(req);
    if (!body.userId) { json(res, 400, { error: "userId required" }); return true; }

    const { error } = await supabase.from("users").update({ status: "paused" }).eq("id", body.userId);
    if (error) {
      console.error("[PAUSE] Error:", error);
      json(res, 500, { error: "Failed to pause user" });
      return true;
    }

    console.log(`[PAUSE] User paused: ${body.userId}`);
    json(res, 200, { success: true });
    return true;
  }

  // API: Resume paused user
  if (method === "POST" && path === "/api/admin/resume") {
    if (!checkAuth(req)) { json(res, 401, { error: "Unauthorized" }); return true; }
    const body = await parseBody(req);
    if (!body.userId) { json(res, 400, { error: "userId required" }); return true; }

    const { error } = await supabase.from("users").update({ status: "active" }).eq("id", body.userId);
    if (error) {
      console.error("[RESUME] Error:", error);
      json(res, 500, { error: "Failed to resume user" });
      return true;
    }

    console.log(`[RESUME] User resumed: ${body.userId}`);
    json(res, 200, { success: true });
    return true;
  }

  // API: Delete user permanently (including all briefings)
  if (method === "POST" && path === "/api/admin/delete") {
    if (!checkAuth(req)) { json(res, 401, { error: "Unauthorized" }); return true; }
    const body = await parseBody(req);
    if (!body.userId) { json(res, 400, { error: "userId required" }); return true; }

    // Delete related briefings first (foreign key constraint)
    await supabase.from("daily_briefing").delete().eq("user_id", body.userId);
    
    // Delete user
    const { error } = await supabase.from("users").delete().eq("id", body.userId);
    
    if (error) {
      console.error("[DELETE] Error:", error);
      json(res, 500, { error: "Failed to delete user" });
      return true;
    }

    console.log(`[DELETE] User permanently deleted: ${body.userId}`);
    json(res, 200, { success: true });
    return true;
  }

  if (method === "POST" && path === "/api/admin/trigger-call") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }

    const body = await parseBody(req);
    const userId = requiredString(body.userId);
    if (!userId) {
      json(res, 400, { error: "userId required" });
      return true;
    }

    try {
      const result = await triggerCallForUser(userId);
      json(res, 200, { success: true, ...result });
    } catch (err: any) {
      console.error("[CALL-SERVICE] Manual trigger failed:", err.message);
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === "GET" && path === "/api/cron/ingest") {
    const authHeader = headerValue(req, "authorization");
    const cronHeader = headerValue(req, "x-cron-secret");
    if (authHeader !== "Bearer " + CRON_SECRET && cronHeader !== CRON_SECRET && cronHeader !== "Bearer " + CRON_SECRET) {
      json(res, 401, { error: "Invalid cron secret" });
      return true;
    }

    try {
      console.log("[CRON-INGEST] Starting news ingest...");
      const { execSync } = await import("node:child_process");
      const output = execSync("npx tsx src/cli/ingest.ts", {
        cwd: process.cwd(),
        timeout: 180000,
        stdio: "pipe",
      }).toString();
      console.log("[CRON-INGEST] Completed:", output.slice(-200));
      json(res, 200, { success: true, output: output.slice(-500) });
    } catch (err: any) {
      console.error("[CRON-INGEST] Failed:", err.message);
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === "GET" && path === "/api/cron/trigger-calls") {
    const authHeader = headerValue(req, "authorization");
    const cronHeader = headerValue(req, "x-cron-secret");
    if (authHeader !== "Bearer " + CRON_SECRET && cronHeader !== CRON_SECRET && cronHeader !== "Bearer " + CRON_SECRET) {
      json(res, 401, { error: "Invalid cron secret" });
      return true;
    }

    try {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const currentHour = istNow.getUTCHours();
      const currentMin = istNow.getUTCMinutes();
      const startMin = Math.floor(currentMin / 15) * 15;
      const endTotalMin = currentHour * 60 + startMin + 15;
      const windowStart = `${currentHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;
      const windowEnd = `${Math.floor((endTotalMin % (24 * 60)) / 60).toString().padStart(2, "0")}:${(endTotalMin % 60).toString().padStart(2, "0")}`;
      const todayIST = istNow.toISOString().split("T")[0];

      console.log(`[CRON] Checking window ${windowStart}-${windowEnd} IST (${todayIST})`);

      const { data: dueUsers, error } = await supabase
        .from("users")
        .select("id, name, preferred_call_time, last_called_date")
        .eq("status", "active")
        .gte("preferred_call_time", windowStart)
        .lt("preferred_call_time", windowEnd)
        .or(`last_called_date.is.null,last_called_date.lt.${todayIST}`);

      if (error) {
        console.error("[CRON] Query error:", error);
        json(res, 500, { error: "Query failed" });
        return true;
      }

      console.log(`[CRON] Found ${(dueUsers || []).length} users due for calls`);

      const results = [];
      for (const user of dueUsers || []) {
        try {
          const result = await triggerCallForUser(user.id);
          await supabase
            .from("users")
            .update({ last_called_date: todayIST })
            .eq("id", user.id);
          results.push({ userId: user.id, name: user.name, status: "called", ...result });
          console.log(`[CRON] Called ${user.name} (${user.id})`);
        } catch (err: any) {
          results.push({ userId: user.id, name: user.name, status: "failed", error: err.message });
          console.error(`[CRON] Failed for ${user.name}:`, err.message);
        }
      }

      json(res, 200, { window: windowStart + "-" + windowEnd, usersProcessed: results.length, results });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}
