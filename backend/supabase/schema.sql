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
              check (status in ('in_stock','low_stock','defective')),
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

-- Incremental columns (safe to re-run).
alter table public.app_users         add column if not exists avatar_url text;
alter table public.incidents         add column if not exists archived boolean not null default false;
alter table public.job_orders        add column if not exists archived boolean not null default false;
alter table public.materials         add column if not exists archived boolean not null default false;
alter table public.material_requests add column if not exists archived boolean not null default false;
alter table public.assets            add column if not exists archived boolean not null default false;
alter table public.advisories        add column if not exists archived boolean not null default false;

-- RLS on (backend uses the service-role key, which bypasses it).
alter table public.app_users         enable row level security;
alter table public.incidents         enable row level security;
alter table public.job_orders        enable row level security;
alter table public.materials         enable row level security;
alter table public.material_requests enable row level security;
alter table public.assets            enable row level security;
alter table public.advisories        enable row level security;

-- ============================================================================
-- Seed data (idempotent via natural unique keys)
-- ============================================================================

insert into public.incidents (ref_code, type, description, location, urgency, status, reported_by) values
  ('INC-1001','leak','Pipe leakage near the public market main line','Brgy. Mercado, Boac','high','in_progress','Valued Customer'),
  ('INC-1002','complaint','Low water pressure during daytime','Brgy. Balogo, Boac','medium','under_verification','Valued Customer'),
  ('INC-1003','new-connection','New residential water connection request','Brgy. Ogbac, Boac','low','scheduled','Valued Customer'),
  ('INC-1004','complaint','Discolored water supply reported','Brgy. Santol, Boac','high','resolved','Valued Customer')
on conflict (ref_code) do nothing;

insert into public.job_orders (ref_code, incident_ref, title, scope, team, assigned_to, estimated_cost, scheduled_date, status) values
  ('JO-2026-101','INC-1001','Repair main line leak','Excavate and replace 2m of damaged PVC pipe','in-house','In-house Team A',3500.00,'2026-07-02','in_progress'),
  ('JO-2026-102','INC-1003','Install new service connection','Tap new household to distribution line','contractor','Boac Pipeworks Inc.',5200.00,'2026-07-05','pending'),
  ('JO-2026-103','INC-1004','Flush and disinfect distribution segment','Flush discolored segment and test quality','in-house','In-house Team B',1200.00,'2026-06-28','completed')
on conflict (ref_code) do nothing;

insert into public.materials (sku, name, category, description, quantity, unit, unit_price, supplier, source, min_level, status) values
  ('SKU-PVC50','PVC Pipe 50mm','Pipes','Schedule 40 PVC pipe, 50mm x 6m',120,'pcs',185.00,'Maynilad Central Warehouse','mother-company',30,'in_stock'),
  ('SKU-GVALV','Gate Valve 2"','Valves','Brass gate valve 2 inch',8,'pcs',640.00,'Marinduque Hardware','external',15,'low_stock'),
  ('SKU-WMTR','Water Meter 1/2"','Meters','Residential water meter 1/2 inch',54,'pcs',850.00,'Maynilad Central Warehouse','mother-company',20,'in_stock'),
  ('SKU-CEMENT','Portland Cement','Consumables','40kg bag Portland cement',6,'bags',255.00,'Boac Builders Supply','external',10,'low_stock'),
  ('SKU-CLAMP','Repair Clamp 50mm','Fittings','Stainless repair clamp 50mm',3,'pcs',420.00,'Marinduque Hardware','external',12,'defective')
on conflict (sku) do nothing;

insert into public.material_requests (ref_code, material_sku, material_name, job_order_ref, quantity, requested_by, status) values
  ('MR-5001','SKU-PVC50','PVC Pipe 50mm','JO-2026-101',4,'In-house Team A','approved'),
  ('MR-5002','SKU-GVALV','Gate Valve 2"','JO-2026-102',2,'Boac Pipeworks Inc.','pending'),
  ('MR-5003','SKU-WMTR','Water Meter 1/2"','JO-2026-102',1,'Boac Pipeworks Inc.','released')
on conflict (ref_code) do nothing;

insert into public.assets (asset_tag, name, type, location, install_date, expected_lifespan_years, last_maintenance, condition) values
  ('AST-PIPE-001','Distribution Main A','Pipe','Brgy. Mercado, Boac','2015-03-12',25,'2025-01-10','good'),
  ('AST-PUMP-002','Booster Pump Station 1','Pump','Brgy. Isok, Boac','2012-08-01',15,'2024-11-20','needs_maintenance'),
  ('AST-MTR-003','Bulk Flow Meter','Meter','Brgy. Balogo, Boac','2009-06-15',12,'2023-05-05','needs_replacement'),
  ('AST-VLV-004','Pressure Relief Valve','Valve','Brgy. Ogbac, Boac','2020-02-20',10,'2025-03-18','good')
on conflict (asset_tag) do nothing;

insert into public.advisories (title, body, area, type, status, published_at) values
  ('Scheduled Maintenance - Brgy. Mercado','Water interruption from 9AM to 3PM for main line repair.','Brgy. Mercado, Boac','maintenance','published', now()),
  ('Emergency Repair - Brgy. Santol','Crews are addressing a reported leak. Service may be intermittent.','Brgy. Santol, Boac','emergency','approved', null),
  ('Service Interruption Notice - Boac Poblacion','Planned interruption for new connection tie-ins next week.','Boac Poblacion','interruption','draft', null)
on conflict do nothing;
