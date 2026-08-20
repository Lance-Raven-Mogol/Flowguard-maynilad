-- ============================================================================
-- FlowGuard — Supabase schema (all modules)
-- Run via:  SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/migrate.mjs
-- or paste into the Supabase SQL Editor. Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Users -----
create table if not exists public.app_users (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null,
  email         text        not null unique,
  role          text        not null check (
                  role in (
                    'customer','zone-specialist','general-manager',
                    'inventory-officer','technical-team'
                  )
                ),
  password_hash text        not null,
  created_at    timestamptz not null default now()
);
create index if not exists app_users_email_idx on public.app_users (lower(email));

-- ----------------------------------------------------- Incident module ------
create table if not exists public.incidents (
  id          uuid primary key default gen_random_uuid(),
  ref_code    text unique not null,
  type        text not null default 'complaint'
              check (type in ('complaint','leak','new-connection','disconnection','other')),
  description text not null,
  location    text,
  urgency     text not null default 'medium' check (urgency in ('low','medium','high')),
  status      text not null default 'under_verification'
              check (status in ('under_verification','in_progress','scheduled','resolved')),
  reported_by text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------- Job order module ------
create table if not exists public.job_orders (
  id             uuid primary key default gen_random_uuid(),
  ref_code       text unique not null,
  incident_ref   text,
  title          text not null,
  scope          text,
  team           text check (team in ('in-house','contractor')),
  assigned_to    text,
  estimated_cost numeric(12,2) default 0,
  scheduled_date date,
  status         text not null default 'pending'
                 check (status in ('pending','in_progress','completed','cancelled')),
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------- Inventory module -----
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique not null,
  name        text not null,
  category    text,
  description text,
  quantity    integer not null default 0,
  unit        text default 'units',
  unit_price  numeric(12,2) default 0,
  supplier    text,
  source      text default 'mother-company',
  min_level   integer not null default 10,
  status      text not null default 'in_stock'
              check (status in ('in_stock','low_stock','out_of_stock','defective')),
  created_at  timestamptz not null default now()
);

create table if not exists public.material_requests (
  id            uuid primary key default gen_random_uuid(),
  ref_code      text unique not null,
  material_sku  text,
  material_name text,
  job_order_ref text,
  quantity      integer not null default 1,
  requested_by  text,
  status        text not null default 'pending'
                check (status in ('pending','approved','released','rejected')),
  created_at    timestamptz not null default now()
);

-- --------------------------------------------- Asset lifecycle module -------
create table if not exists public.assets (
  id                      uuid primary key default gen_random_uuid(),
  asset_tag               text unique not null,
  name                    text not null,
  type                    text,
  location                text,
  install_date            date,
  expected_lifespan_years integer default 10,
  last_maintenance        date,
  condition               text not null default 'good'
                          check (condition in ('good','needs_maintenance','needs_replacement','dispose')),
  created_at              timestamptz not null default now()
);

-- ----------------------------------------------- Service advisory module ----
create table if not exists public.advisories (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  area         text,
  type         text not null default 'maintenance'
               check (type in ('maintenance','interruption','emergency')),
  status       text not null default 'draft'
               check (status in ('draft','approved','published')),
  created_at   timestamptz not null default now(),
  published_at timestamptz
);

-- ------------------------------------------ Pending registrations (OTP) -----
create table if not exists public.pending_registrations (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null,
  email         text        not null unique,
  password_hash text        not null,
  barangay      text        default 'Boac',
  otp_code      text        not null,
  otp_expires   timestamptz not null,
  attempts      integer     not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists pending_registrations_email_idx on public.pending_registrations (lower(email));

-- Incremental columns (safe to re-run).
alter table public.app_users         add column if not exists avatar_url text;
alter table public.app_users         add column if not exists start_date date;
alter table public.app_users         add column if not exists is_archived boolean not null default false;
alter table public.app_users         add column if not exists barangay text default 'Boac';
alter table public.app_users         add column if not exists otp_secret text;
alter table public.app_users         add column if not exists otp_enabled boolean not null default false;
alter table public.app_users         alter column otp_enabled set default false;
alter table public.incidents         add column if not exists archived boolean not null default false;
-- Zone-specialist remarks forwarded to the technical team + customer photo evidence.
alter table public.incidents         add column if not exists remarks text;
alter table public.incidents         add column if not exists images  jsonb not null default '[]'::jsonb;
alter table public.job_orders        add column if not exists archived boolean not null default false;
-- Team assignment for a job order (general manager assigns a tech-team crew).
alter table public.job_orders        add column if not exists team_name    text;
alter table public.job_orders        add column if not exists team_leader  text;
alter table public.job_orders        add column if not exists team_members jsonb not null default '[]'::jsonb;
alter table public.materials         add column if not exists archived boolean not null default false;
alter table public.materials         add column if not exists weight_kg numeric(10,2) default 0;
alter table public.materials         add column if not exists size text;
alter table public.materials         add column if not exists color text;
alter table public.material_requests add column if not exists archived boolean not null default false;
-- Set once, server-side, when an approved request's stock has been deducted
-- from inventory — guarantees the deduction happens exactly once.
alter table public.material_requests add column if not exists stock_deducted boolean not null default false;
-- Unified Requests migration: material_requests now absorbs supply_requests.
-- request_type: 'mrf'      = formal Material Request Form (linked to job order / SKU)
--               'general'  = informal supply/general request (formerly supply_requests)
--               'purchase' = procurement request with pricing (formerly purchase_requests)
alter table public.material_requests add column if not exists request_type    text not null default 'mrf'
                                     check (request_type in ('mrf','general','purchase'));
alter table public.material_requests add column if not exists reason          text;
alter table public.material_requests add column if not exists requested_by_id uuid;
-- Purchase-type columns (formerly in purchase_requests)
alter table public.material_requests add column if not exists category    text;
alter table public.material_requests add column if not exists description text;
alter table public.material_requests add column if not exists unit        text default 'units';
alter table public.material_requests add column if not exists min_level   integer default 10;
alter table public.material_requests add column if not exists weight_kg   numeric(10,2) default 0;
alter table public.material_requests add column if not exists size        text;
alter table public.material_requests add column if not exists color       text;
alter table public.material_requests add column if not exists unit_price  numeric(12,2) default 0;
alter table public.material_requests add column if not exists total_cost  numeric(12,2) default 0;
alter table public.material_requests add column if not exists source      text default 'external';
alter table public.material_requests add column if not exists supplier    text;
alter table public.material_requests add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.material_requests add column if not exists justification text;
-- Customer general-request fulfillment fields
--   payment_option: how the customer intends to pay ('cash_on_delivery' or 'gcash')
--   delivery_address: where to deliver the requested item (pre-filled from the customer's barangay)
alter table public.material_requests add column if not exists payment_option   text;
alter table public.material_requests add column if not exists delivery_address text;
-- supply_requests and purchase_requests are superseded by material_requests.
-- Kept in schema for backward compatibility; no new rows should be written here.
alter table public.assets            add column if not exists archived boolean not null default false;
alter table public.advisories        add column if not exists archived boolean not null default false;

-- ----------------------------------------------- Audit log -----------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  entity      text        not null,
  entity_id   text,
  action      text        not null,
  actor       text,
  actor_role  text,
  details     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.audit_logs add column if not exists archived boolean not null default false;

-- --------------------------------------------- Supplier profiles -----------
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text unique not null,
  contact_person  text,
  email           text,
  phone           text,
  address         text,
  notes           text,
  status          text not null default 'active' check (status in ('active','inactive')),
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.materials add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

-- --------------------------------------------- Purchase requests -----------
create table if not exists public.purchase_requests (
  id              uuid primary key default gen_random_uuid(),
  ref_code        text unique not null,
  material_name   text not null,
  quantity        integer not null default 1,
  unit            text default 'units',
  unit_price      numeric(12,2) default 0,
  total_cost      numeric(12,2) default 0,
  supplier        text,
  justification   text,
  requested_by    text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','ordered','received','rejected')),
  created_at      timestamptz not null default now()
);
alter table public.purchase_requests add column if not exists archived boolean not null default false;
alter table public.purchase_requests add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.purchase_requests add column if not exists category text;
alter table public.purchase_requests add column if not exists description text;
alter table public.purchase_requests add column if not exists min_level integer default 10;
alter table public.purchase_requests add column if not exists weight_kg numeric(10,2) default 0;
alter table public.purchase_requests add column if not exists size text;
alter table public.purchase_requests add column if not exists color text;
alter table public.purchase_requests add column if not exists source text default 'external';

-- --------------------------------------------- E-Billing -------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  ref_code        text unique not null,
  customer_name   text,
  customer_email  text,
  amount          numeric(12,2) not null default 0,
  due_date        date,
  paid_date       date,
  status          text not null default 'pending'
                  check (status in ('pending','paid','late','overdue')),
  notes           text,
  created_at      timestamptz not null default now()
);
alter table public.payments add column if not exists archived boolean not null default false;
alter table public.payments add column if not exists incident_ref text;
alter table public.payments add column if not exists job_order_ref text;
alter table public.payments add column if not exists service_description text;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists account_name text;
alter table public.payments add column if not exists account_number text;
alter table public.payments add column if not exists payment_qr jsonb not null default '[]'::jsonb;
alter table public.payments add column if not exists amount_paid numeric(12,2);
alter table public.payments add column if not exists payment_date date;
alter table public.payments add column if not exists payment_reference text;
alter table public.payments add column if not exists payment_proof jsonb not null default '[]'::jsonb;
alter table public.payments add column if not exists verification_notes text;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','unpaid','for_verification','paid','rejected','late','overdue'));

-- Reusable payment destinations configured by the General Manager.
create table if not exists public.payment_methods (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  payment_method  text not null,
  account_name    text not null,
  account_number  text,
  payment_qr      jsonb not null default '[]'::jsonb,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- --------------------------------------------- Supply requests --------------
create table if not exists public.supply_requests (
  id              uuid primary key default gen_random_uuid(),
  ref_code        text unique not null,
  item_name       text not null,
  quantity        integer not null default 1,
  reason          text,
  requested_by    text,
  requested_by_id uuid,
  status          text not null default 'pending'
                  check (status in ('pending','approved','fulfilled','rejected')),
  created_at      timestamptz not null default now()
);
alter table public.supply_requests add column if not exists archived boolean not null default false;

-- RLS on (backend uses the service-role key, which bypasses it).
alter table public.app_users            enable row level security;
alter table public.incidents            enable row level security;
alter table public.job_orders           enable row level security;
alter table public.materials            enable row level security;
alter table public.material_requests    enable row level security;
alter table public.assets               enable row level security;
alter table public.advisories           enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.suppliers            enable row level security;
alter table public.purchase_requests    enable row level security;
alter table public.payments             enable row level security;
alter table public.payment_methods      enable row level security;
alter table public.supply_requests      enable row level security;
alter table public.pending_registrations enable row level security;

-- ============================================================================
-- No seed business data. Tables start empty; the only account created is the
-- administrator (see backend/src/models/seed.ts / scripts/migrate.mjs).
-- ============================================================================
