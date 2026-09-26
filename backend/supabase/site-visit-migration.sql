-- Structured zone-specialist Site Visit Plan (#19, 2026-09-27).
-- Safe to re-run. Paste into the Supabase SQL editor (also in schema.sql).
alter table public.incidents add column if not exists site_visit_date       date;
alter table public.incidents add column if not exists site_visit_period     text;
alter table public.incidents add column if not exists site_visit_companions jsonb not null default '[]'::jsonb;
alter table public.incidents add column if not exists site_visit_materials  jsonb not null default '[]'::jsonb;
alter table public.incidents add column if not exists site_visit_notes      text;
