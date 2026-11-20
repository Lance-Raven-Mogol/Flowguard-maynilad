-- ---------------- Job order target completion date (2026-11-19) ----------
-- The Commercial Department sets the date a job order must be finished by
-- ("set to works") when it creates the job order. Safe to re-run.
alter table public.job_orders add column if not exists target_completion_date date;
create index if not exists job_orders_target_completion_idx on public.job_orders (target_completion_date);
