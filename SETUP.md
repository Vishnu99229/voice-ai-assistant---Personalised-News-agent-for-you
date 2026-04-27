# Morning Brief - Setup Guide

## 1. Run Database Migration

Open Supabase SQL Editor, paste the contents of `src/db/migration-v2.sql`, then run it.

## 2. Set Environment Variables

Add to `.env` and Railway:

- `ADMIN_PASSWORD` - your admin login password
- `CRON_SECRET` - secret for the cron trigger endpoint

## 3. Deploy

```bash
git push origin main
railway up --detach
```

## 4. Test Landing Page

Visit: `https://morning-brief-agent-production.up.railway.app/`

Fill out the form. The submission should appear in the Supabase `users` table with `status = 'pending'`.

## 5. Test Admin Panel

Visit: `https://morning-brief-agent-production.up.railway.app/admin`

Log in with `ADMIN_PASSWORD`.

See waitlist, click Approve, and `profile_json` is generated via LLM.

Click "Call now" on any active user. Their phone should ring.

## 6. Set Up Daily Cron

Use cron-job.org (free):

- URL: `https://morning-brief-agent-production.up.railway.app/api/cron/trigger-calls`
- Method: `GET`
- Header: `Authorization: Bearer <your-CRON_SECRET>`
- Schedule: every 15 minutes (`*/15 * * * *`)

This checks which active users are due for their daily call and triggers it.

Railway does not natively support cron for hitting your running service endpoint. You can also create a separate Railway Cron Service that calls the same URL every 15 minutes with the same authorization header.

## 7. Daily Operations

- News ingestion still runs via `npm run ingest` (run once daily, or add another cron).
- Approve new waitlist users via `/admin`.
- Monitor calls in the Vapi dashboard logs.

## URLs

- Landing page: `/`
- Admin panel: `/admin`
- Health check: `/health`
- Webhook: `/webhook` (Vapi events)
