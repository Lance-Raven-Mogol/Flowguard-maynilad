-- Customer registration window: 2 months (2026-11-28).
-- A customer account that has not become a registered Maynilad customer
-- (no CAN / account number) by its registration deadline is deactivated
-- (is_archived = true), never deleted. Accounts that existed before this was
-- added get 2 months from the first run. Safe to re-run.
alter table public.app_users add column if not exists account_number        text;
alter table public.app_users add column if not exists registration_deadline timestamptz;
create unique index if not exists app_users_account_number_idx
  on public.app_users (account_number) where account_number is not null;
update public.app_users
   set registration_deadline = now() + interval '2 months'
 where role = 'customer' and registration_deadline is null and coalesce(account_number, '') = '';
