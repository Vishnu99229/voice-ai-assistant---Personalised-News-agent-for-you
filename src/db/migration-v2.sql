-- Additive migration - safe to run on existing DB
-- Run this in Supabase SQL Editor before deploying

-- New columns on users table
alter table users add column if not exists status text default 'pending';
alter table users add column if not exists approved_at timestamptz;
alter table users add column if not exists last_called_date date;
alter table users add column if not exists form_data_json jsonb;
alter table users add column if not exists name text;

-- Update existing user (Vishnu) to active so nothing breaks
update users set status = 'active', name = (profile_json->>'name') where status is null or status = 'pending';

-- Indexes for cron query performance
create index if not exists idx_users_status on users(status);
create index if not exists idx_users_call_schedule on users(status, preferred_call_time, last_called_date);
