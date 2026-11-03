-- Terms and Conditions acceptance + senior citizen discount (2026-11-03).
-- Safe to re-run. Paste into the Supabase SQL editor (also in schema.sql).
alter table public.app_users add column if not exists is_senior         boolean not null default false;
alter table public.app_users add column if not exists senior_id_number  text;
alter table public.app_users add column if not exists terms_accepted_at timestamptz;
