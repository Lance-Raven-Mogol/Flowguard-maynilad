-- FIFO stock batches (2026-11-07). Each stock-in (a new item's first stock, a
-- restock, a received purchase request) is its own batch with its own price
-- per piece. Stock leaves the oldest batch first and is priced from the batch
-- it came out of. materials.quantity stays the on-hand total and
-- materials.unit_price the price of the batch that goes out next. Safe to re-run.
create table if not exists public.material_batches (
  id                  uuid primary key default gen_random_uuid(),
  material_id         uuid not null references public.materials(id) on delete cascade,
  material_sku        text,
  batch_no            integer not null,
  quantity_received   numeric not null default 0 check (quantity_received >= 0),
  quantity_remaining  numeric not null default 0 check (quantity_remaining >= 0),
  unit_price          numeric(12,2) not null default 0,
  supplier            text,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  source              text,
  reference           text,
  received_by         text,
  received_at         timestamptz not null default now(),
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (material_id, batch_no)
);
create index if not exists material_batches_material_idx on public.material_batches (material_id);

-- Stock that existed before batches becomes each item's opening batch #1.
insert into public.material_batches
  (material_id, material_sku, batch_no, quantity_received, quantity_remaining, unit_price, supplier, supplier_id, source, reference, received_at)
select m.id, m.sku, 1, m.quantity, m.quantity, coalesce(m.unit_price, 0), m.supplier, m.supplier_id, m.source, 'Opening stock', m.created_at
from public.materials m
where m.quantity > 0
  and not exists (select 1 from public.material_batches b where b.material_id = m.id);

-- RLS on (backend uses the service-role key, which bypasses it).
alter table public.material_batches enable row level security;

-- Usable leftovers returned to stock from a job order (they were not used, so
-- they come off the job order's material cost): [{ material_sku, quantity, amount, batches }]
alter table public.job_orders add column if not exists returned_materials jsonb not null default '[]'::jsonb;
