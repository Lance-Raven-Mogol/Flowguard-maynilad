-- Itemized complaint charges + no-charge complaints (#2 / #16 / #18, 2026-09-26).
-- Safe to re-run. Paste into the Supabase SQL editor (also in schema.sql).
alter table public.incidents add column if not exists charges  jsonb   not null default '[]'::jsonb;
alter table public.incidents add column if not exists billable boolean not null default true;
alter table public.payments  add column if not exists charges  jsonb   not null default '[]'::jsonb;
