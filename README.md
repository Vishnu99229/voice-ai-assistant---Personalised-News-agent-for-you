# Morning Brief Agent

A hyper-personalized daily news briefing script generator. Fetches news from RSS feeds and NewsAPI, ranks articles against a user profile using GPT-4o, and generates a voice-ready briefing script.

**Day 1 of 3** — Data pipeline + script generation (CLI only). Day 2 will add the Vapi voice agent consuming `daily_briefing.selected_articles_json`.

---

## Setup

### 1. Install dependencies

```bash
cd morning-brief-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API → `service_role` key |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `NEWSAPI_KEY` | [newsapi.org/register](https://newsapi.org/register) |

### 3. Create database tables

Open your **Supabase SQL Editor** (Dashboard → SQL Editor → New Query), paste the contents of `src/db/schema.sql`, and click **Run**.

```bash
npm run db:init   # prints a reminder of this step
```

### 4. Seed the test user

```bash
npm run seed
```

This will print the user's UUID — **save it**, you'll need it for the next commands.

### 5. Run the full pipeline

```bash
npm run daily -- <userId>
```

This runs: **ingest → rank → script** in sequence.

---

## Individual commands

| Command | What it does |
|---|---|
| `npm run ingest` | Fetch RSS + NewsAPI, dedupe, scrape full text, upsert to `news_pool` |
| `npm run rank -- <userId>` | Score all recent articles against user profile, print top 10 |
| `npm run script -- <userId>` | Rank + generate briefing script, save to `daily_briefing` |
| `npm run daily -- <userId>` | Full pipeline: ingest → rank → script |
| `npm run seed` | (Re)seed the test user profile |

---

## Tuning the ranking prompt

If ranking results feel off (too many irrelevant articles scoring high, or good articles getting filtered out), edit `src/rank/prompt.ts`:

### Common tweaks:

- **Lower the threshold**: In `src/rank/rank.ts`, change the `score >= 6` filter to `>= 5` to be more permissive.
- **Adjust scoring rubric**: Edit the system message in `src/rank/prompt.ts` to change what scores map to. For example, if location-based news is overwhelming the results, demote "locations" from 7-9 range to 4-6.
- **Add scoring examples**: Add few-shot examples to the system message showing an article, the expected score, and why.
- **Tune VIP sensitivity**: If VIP entity matches aren't scoring 10, make the instruction more explicit: _"If ANY vip_entity name appears in the title or content, score 10 regardless of other factors."_
- **Broaden/narrow explicit_filters**: Edit the user profile's `explicit_filters` array in `seed-user.ts` (and re-run `npm run seed`) to block or allow more categories.

### Debugging scores:

After ranking, the CLI prints a table of all top-10 articles with scores and reasons. The full ranking debug (all articles, all scores) is saved to `daily_briefing.ranking_debug_json` for deeper analysis.

---

## Architecture

```
RSS Feeds (8 sources)  ─┐
                         ├─→ Dedupe ─→ Scrape Full Text ─→ news_pool (Supabase)
NewsAPI (5 queries)    ─┘

news_pool ─→ GPT-4o Ranking (per-article scoring) ─→ Top 10

Top 10 + User Profile ─→ GPT-4o Script Generation ─→ daily_briefing
```

---

## What's next (Day 2+)

- **Day 2**: Vapi voice agent that reads `daily_briefing.briefing_script` aloud, with `selected_articles_json` available for follow-up Q&A.
- **Day 3**: Scheduling (cron), user preferences API, feedback loop.
