-- Zone Specialist required materials (2026-11-03). Entered once on the complaint and
-- carried to the Technical Team's price breakdown, the Job Order and the MRF. Safe to re-run.
alter table public.incidents add column if not exists required_materials jsonb not null default '[]'::jsonb;
