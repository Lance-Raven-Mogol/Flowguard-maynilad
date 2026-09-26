-- Capstone panel reminders #3, #4, #6 (2026-09-26). Safe to re-run.
-- Paste into the Supabase SQL editor (the same statements are in schema.sql).

-- #4 Grouped complaint categories. Old values stay valid for existing rows.
alter table public.incidents drop constraint if exists incidents_type_check;
alter table public.incidents add constraint incidents_type_check
  check (type in (
    'odor-water','dirty-water',                                       -- Water Quality
    'low-pressure','no-water',                                        -- Water Supply
    'leak','burst-main',                                              -- Leak / Pipe
    'new-connection','reconnection','meter-replacement','disconnection', -- Service Request
    'complaint','other'                                               -- Other
  ));

-- #6 Safety stock: units that must stay in inventory (never released to 0).
alter table public.materials add column if not exists safety_level integer not null default 1;

-- #3 Walk-in cash payments recorded at the office.
alter table public.payments add column if not exists recorded_by text;
