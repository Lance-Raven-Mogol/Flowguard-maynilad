-- ------------- Register asset on job order completion (2026-11-19) ------
-- The assigned team leader's last step: register the installed asset (linked
-- to the job order), or record why no new asset was installed. Safe to re-run.
alter table public.assets     add column if not exists job_order_ref   text;
alter table public.job_orders add column if not exists asset_tag       text;
alter table public.job_orders add column if not exists no_asset_reason text;
create index if not exists assets_job_order_ref_idx on public.assets (job_order_ref);
