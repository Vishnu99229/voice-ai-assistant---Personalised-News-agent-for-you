-- Morning Brief Agent — Database Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  phone text,
  timezone text default 'Asia/Kolkata',
  preferred_call_time time default '08:00',
  profile_json jsonb not null,
  created_at timestamptz default now()
);

create table if not exists news_pool (
  id uuid primary key default gen_random_uuid(),
  url text unique not null,
  title text not null,
  source text,
  published_at timestamptz,
  full_text text,
  summary text,
  fetched_at timestamptz default now()
);

create index if not exists news_pool_fetched_at_idx on news_pool(fetched_at desc);

create table if not exists daily_briefing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  briefing_date date not null,
  briefing_script text not null,
  selected_articles_json jsonb not null,
  ranking_debug_json jsonb,
  feedback jsonb default null,
  created_at timestamptz default now(),
  unique(user_id, briefing_date)
);

-- Add feedback column if table already exists (idempotent migration)
ALTER TABLE daily_briefing ADD COLUMN IF NOT EXISTS feedback JSONB DEFAULT NULL;
