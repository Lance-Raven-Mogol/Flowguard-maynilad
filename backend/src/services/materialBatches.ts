/**
 * FIFO stock batches. Every time stock comes in (the first stock of a new
 * item, a restock, a received purchase request) it is kept as its own batch
 * with its own price per piece. Stock always leaves from the oldest batch
 * first (First In, First Out), and what it costs is priced from the batches it
 * actually came out of.
 *
 * `materials.quantity` stays the on-hand total (sum of the batches) and
 * `materials.unit_price` the price of the batch that goes out next, so the
 * rest of the app keeps working with them as before.
 */
import * as repo from '../models/resourceRepo.js';
import type { Row, DbError } from '../models/resourceRepo.js';
import { serviceUnavailable } from '../utils/httpError.js';

export const BATCH_TABLE = 'material_batches';

/** How much of one batch a stock movement used (or returned). */
export interface BatchAllocation {
  batch_id: string;
  batch_no: number;
  quantity: number;
  unit_price: number;
  amount: number;
}

/** Where a new batch came from. */
export interface BatchInfo {
  unit_price: number;
  supplier?: unknown;
  supplier_id?: unknown;
  source?: unknown;
  reference?: unknown;
  received_by?: unknown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
const remainingOf = (b: Row) => num(b.quantity_remaining);

/** The table is missing until material-batches-migration.sql is applied — say so clearly. */
function rethrow(err: unknown): never {
  const e = err as DbError;
  if (['42P01', 'PGRST205'].includes(String(e?.code)) || /material_batches/.test(String(e?.message ?? ''))) {
    throw serviceUnavailable(
      'The database is missing the material_batches table (FIFO stock batches). ' +
        'Run backend/supabase/material-batches-migration.sql in Supabase and try again.',
    );
  }
  throw err as Error;
}

/** FIFO order — batch numbers go up in the order stock was received. */
export const fifoSort = (batches: Row[]): Row[] => [...batches].sort((a, b) => num(a.batch_no) - num(b.batch_no));

/** The price stock goes out at next: the oldest batch that still has stock. */
export function currentPrice(batches: Row[], fallback: unknown = 0): number {
  const sorted = fifoSort(batches);
  const open = sorted.find((b) => remainingOf(b) > 0);
  const last = sorted[sorted.length - 1];
  return num((open ?? last)?.unit_price ?? fallback);
}

/** The material columns that follow from its batches. */
export function summarize(batches: Row[], material: Row): { quantity: number; unit_price: number } {
  return {
    quantity: batches.reduce((sum, b) => sum + remainingOf(b), 0),
    unit_price: currentPrice(batches, material.unit_price),
  };
}

async function allBatches(materialId: string): Promise<Row[]> {
  try {
    return fifoSort((await repo.findRowsBy(BATCH_TABLE, 'material_id', materialId)).filter((b) => !b.archived));
  } catch (err) {
    rethrow(err);
  }
}

async function insertBatch(material: Row, batchNo: number, qty: number, info: BatchInfo, receivedAt?: unknown): Promise<Row> {
  try {
    return await repo.insertRow(BATCH_TABLE, {
      material_id: material.id,
      material_sku: material.sku ?? null,
      batch_no: batchNo,
      quantity_received: qty,
      quantity_remaining: qty,
      unit_price: round2(num(info.unit_price)),
      supplier: info.supplier ?? null,
      supplier_id: info.supplier_id || null,
      source: info.source ?? null,
      reference: info.reference ?? null,
      received_by: info.received_by ?? null,
      received_at: receivedAt ?? new Date().toISOString(),
    });
  } catch (err) {
    rethrow(err);
  }
}

async function setRemaining(batch: Row, remaining: number, extra: Row = {}): Promise<void> {
  batch.quantity_remaining = remaining;
  Object.assign(batch, extra);
  try {
    await repo.updateRow(BATCH_TABLE, String(batch.id), { quantity_remaining: remaining, ...extra });
  } catch (err) {
    rethrow(err);
  }
}

const nextBatchNo = (batches: Row[]) => batches.reduce((max, b) => Math.max(max, num(b.batch_no)), 0) + 1;

/** Plan which batches `qty` comes out of, oldest first. Pure — nothing is written. */
export function planFifo(batches: Row[], qty: number): { allocations: BatchAllocation[]; shortfall: number } {
  const allocations: BatchAllocation[] = [];
  let left = qty;
  for (const batch of fifoSort(batches)) {
    if (left <= 0) break;
    const take = Math.min(remainingOf(batch), left);
    if (take <= 0) continue;
    const price = num(batch.unit_price);
    allocations.push({
      batch_id: String(batch.id),
      batch_no: num(batch.batch_no),
      quantity: take,
      unit_price: price,
      amount: round2(take * price),
    });
    left -= take;
  }
  return { allocations, shortfall: Math.max(0, left) };
}

async function consume(batches: Row[], qty: number): Promise<BatchAllocation[]> {
  const { allocations } = planFifo(batches, qty);
  for (const a of allocations) {
    const batch = batches.find((b) => String(b.id) === a.batch_id)!;
    await setRemaining(batch, remainingOf(batch) - a.quantity);
  }
  return allocations;
}

/**
 * A material's batches in FIFO order, kept in step with `materials.quantity`.
 * Items that existed before batches get an opening batch (#1) at their price;
 * any other difference (e.g. a change made outside the app) is settled the
 * FIFO way — extra stock joins the newest batch, missing stock leaves the oldest.
 */
export async function loadBatches(material: Row): Promise<Row[]> {
  const batches = await allBatches(String(material.id));
  const diff = num(material.quantity) - batches.reduce((sum, b) => sum + remainingOf(b), 0);
  if (diff > 0) {
    if (!batches.length) {
      batches.push(await insertBatch(
        material, 1, diff,
        { unit_price: num(material.unit_price), supplier: material.supplier, supplier_id: material.supplier_id, source: material.source, reference: 'Opening stock' },
        material.created_at,
      ));
    } else {
      const newest = batches[batches.length - 1];
      await setRemaining(newest, remainingOf(newest) + diff, { quantity_received: num(newest.quantity_received) + diff });
    }
  } else if (diff < 0) {
    await consume(batches, -diff);
  }
  return batches;
}

/** Stock in as a new batch with its own price per piece. */
export async function stockIn(material: Row, qty: number, info: BatchInfo): Promise<{ patch: Row; batch: Row }> {
  const batches = await loadBatches(material);
  const batch = await insertBatch(material, nextBatchNo(batches), qty, info);
  batches.push(batch);
  return { patch: summarize(batches, material), batch };
}

/** Stock out, oldest batch first. Returns the batches it came from and their cost. */
export async function stockOut(material: Row, qty: number): Promise<{ patch: Row; allocations: BatchAllocation[]; amount: number }> {
  const batches = await loadBatches(material);
  const allocations = await consume(batches, qty);
  return {
    patch: summarize(batches, material),
    allocations,
    amount: round2(allocations.reduce((sum, a) => sum + a.amount, 0)),
  };
}

/**
 * Set the on-hand quantity directly (physical stock count / correction).
 * A shortage leaves the oldest batches first; extra stock joins the newest.
 */
export async function stockAdjust(material: Row, quantity: number): Promise<{ patch: Row; allocations: BatchAllocation[] }> {
  const batches = await loadBatches(material);
  const onHand = batches.reduce((sum, b) => sum + remainingOf(b), 0);
  let allocations: BatchAllocation[] = [];
  if (quantity < onHand) {
    allocations = await consume(batches, onHand - quantity);
  } else if (quantity > onHand) {
    allocations = [await addToNewest(material, batches, quantity - onHand, 'Stock count')];
  }
  return { patch: summarize(batches, material), allocations };
}

/** Put stock that has no price of its own into the newest batch (or a first batch). */
async function addToNewest(material: Row, batches: Row[], qty: number, reference: string): Promise<BatchAllocation> {
  let batch = batches[batches.length - 1];
  if (batch) {
    await setRemaining(batch, remainingOf(batch) + qty, { quantity_received: num(batch.quantity_received) + qty });
  } else {
    batch = await insertBatch(material, 1, qty, { unit_price: num(material.unit_price), reference });
    batches.push(batch);
  }
  const price = num(batch.unit_price);
  return { batch_id: String(batch.id), batch_no: num(batch.batch_no), quantity: qty, unit_price: price, amount: round2(qty * price) };
}

/**
 * Usable leftovers go back into the batches they were released from for that
 * job order (the last batch taken from first), so they keep their own price.
 * Anything that can't be matched joins the newest batch.
 */
export async function stockReturn(material: Row, qty: number, jobOrderRef: string): Promise<{ patch: Row; allocations: BatchAllocation[] }> {
  const batches = await loadBatches(material);
  const logs = await repo.findRowsBy('audit_logs', 'entity_id', String(material.id)).catch(() => [] as Row[]);
  const outstanding = new Map<string, number>();
  const order: string[] = [];
  for (const log of [...logs].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))) {
    const d = (log.details ?? {}) as Row;
    const batchesOfLog = Array.isArray(d.batches) ? (d.batches as BatchAllocation[]) : [];
    if (d.movement_type === 'stock_out' && String(d.job_order_ref ?? '') === jobOrderRef) {
      for (const a of batchesOfLog) {
        outstanding.set(a.batch_id, (outstanding.get(a.batch_id) ?? 0) + num(a.quantity));
        order.push(a.batch_id);
      }
    } else if (String(d.returned_from_job_order ?? '') === jobOrderRef) {
      for (const a of batchesOfLog) outstanding.set(a.batch_id, (outstanding.get(a.batch_id) ?? 0) - num(a.quantity));
    }
  }

  const allocations: BatchAllocation[] = [];
  let left = qty;
  for (const batchId of [...new Set(order.reverse())]) {
    if (left <= 0) break;
    const batch = batches.find((b) => String(b.id) === batchId);
    const room = Math.min(outstanding.get(batchId) ?? 0, left);
    if (!batch || room <= 0) continue;
    await setRemaining(batch, remainingOf(batch) + room);
    allocations.push({ batch_id: batchId, batch_no: num(batch.batch_no), quantity: room, unit_price: num(batch.unit_price), amount: round2(room * num(batch.unit_price)) });
    left -= room;
  }
  if (left > 0) allocations.push(await addToNewest(material, batches, left, 'Returned leftovers'));
  return { patch: summarize(batches, material), allocations };
}

/** Correct the price of the batch that goes out next (e.g. an opening batch saved without a price). */
export async function setCurrentBatchPrice(material: Row, price: number): Promise<{ patch: Row; batch?: Row }> {
  const batches = await loadBatches(material);
  const open = batches.find((b) => remainingOf(b) > 0) ?? batches[batches.length - 1];
  if (open) {
    open.unit_price = round2(price);
    try {
      await repo.updateRow(BATCH_TABLE, String(open.id), { unit_price: round2(price) });
    } catch (err) {
      rethrow(err);
    }
  }
  return { patch: open ? summarize(batches, material) : { unit_price: round2(price) }, batch: open };
}

/** Attach each material's batches (FIFO order) for the Material List. Never fails the list. */
export async function withBatches(materials: Row[]): Promise<Row[]> {
  if (!materials.length) return materials;
  let batches: Row[] = [];
  try {
    batches = await repo.listRows(BATCH_TABLE, {});
  } catch {
    return materials; // not migrated yet — the list still loads
  }
  const byMaterial = new Map<string, Row[]>();
  for (const b of batches) {
    const key = String(b.material_id);
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), b]);
  }
  return materials.map((m) => ({ ...m, batches: fifoSort(byMaterial.get(String(m.id)) ?? []) }));
}

/** Fail before a write if the batches table has not been migrated yet. */
export async function assertReady(): Promise<void> {
  try {
    await repo.findRowsBy(BATCH_TABLE, 'material_id', '00000000-0000-0000-0000-000000000000');
  } catch (err) {
    rethrow(err);
  }
}

/** A brand-new item's stock becomes its batch #1, at the price it was added with. */
export async function firstBatch(material: Row, info: BatchInfo): Promise<Row | null> {
  const qty = num(material.quantity);
  if (!(qty > 0) || (await allBatches(String(material.id))).length) return null;
  return insertBatch(material, 1, qty, info);
}
