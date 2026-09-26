-- MRF workflow + multi-material requests (2026-09-26).
-- Flow: pending (for stock verification) → verified (Inventory Officer)
--       → approved (General Manager) → released (Inventory Officer); rejected at either review.
-- Safe to re-run. Paste into the Supabase SQL editor, or run scripts/migrate.mjs.
alter table public.material_requests add column if not exists items       jsonb not null default '[]'::jsonb;
alter table public.material_requests add column if not exists verified_by text;
alter table public.material_requests add column if not exists verified_at timestamptz;
alter table public.material_requests add column if not exists approved_by text;
alter table public.material_requests add column if not exists approved_at timestamptz;
alter table public.material_requests add column if not exists released_by text;
alter table public.material_requests add column if not exists released_at timestamptz;
alter table public.material_requests drop constraint if exists material_requests_status_check;
alter table public.material_requests add constraint material_requests_status_check
  check (status in ('pending','verified','approved','released','rejected','ordered','received'));
