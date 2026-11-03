-- Waste management for leftover materials that are Not in Good Condition (2026-11-03).
-- Team leader reports them (Log Leftovers) → Inventory Officer disposes them with
-- photo proof → General Manager verifies from the photos. Safe to re-run.
create table if not exists public.waste_disposals (
  id                  uuid primary key default gen_random_uuid(),
  ref_code            text unique,
  job_order_ref       text not null,
  mrf_id              text,
  material_sku        text,
  material_name       text not null,
  quantity            numeric not null default 0 check (quantity >= 0),
  unit                text,
  condition           text not null default 'damaged',
  remarks             text,
  status              text not null default 'pending_disposal'
                      check (status in ('pending_disposal','disposed','verified','rejected')),
  reported_by         text,
  reported_by_id      text,
  reported_by_role    text,
  disposal_method     text,
  disposal_location   text,
  disposal_images     jsonb not null default '[]'::jsonb,
  disposal_notes      text,
  disposed_by         text,
  disposed_by_id      text,
  disposed_at         timestamptz,
  verified_by         text,
  verified_at         timestamptz,
  verification_notes  text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists waste_disposals_job_order_idx on public.waste_disposals (job_order_ref);
create index if not exists waste_disposals_status_idx    on public.waste_disposals (status);

-- RLS on (backend uses the service-role key, which bypasses it).
alter table public.waste_disposals enable row level security;
