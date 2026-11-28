-- Purchase Order Number on stock batches (2026-11-28).
-- Every restock done by hand, and the initial stock of a new item, records
-- the PO Number it was bought under. Older batches stay blank. Safe to re-run.
alter table public.material_batches add column if not exists po_number text;
create index if not exists material_batches_po_number_idx on public.material_batches (po_number);
