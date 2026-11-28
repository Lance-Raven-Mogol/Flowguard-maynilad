-- Commercial review of the investigation findings (2026-11-28).
-- The Zone Specialist encodes the findings; the Commercial Department approves
-- them (complaint -> In Progress) or disapproves them with a reason, which
-- sends them back to the Zone Specialist. Safe to re-run.
alter table public.incidents add column if not exists findings_status text
  check (findings_status in ('pending','approved','disapproved'));
alter table public.incidents add column if not exists findings_reason       text;
alter table public.incidents add column if not exists findings_submitted_at timestamptz;
alter table public.incidents add column if not exists findings_reviewed_at  timestamptz;
alter table public.incidents add column if not exists findings_reviewed_by  text;
