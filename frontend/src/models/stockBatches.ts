/**
 * FIFO stock batches — mirrors backend/src/services/materialBatches.ts.
 * Each stock-in is a batch with its own price per piece; stock leaves the
 * oldest batch first and is priced from the batch it came out of. The API
 * attaches each material's batches (FIFO order) as `material.batches`.
 */
import type { EntityRow } from '../services/resourceService';

export interface StockBatch {
  id: string;
  batch_no: number;
  quantity_received: number;
  quantity_remaining: number;
  unit_price: number;
  supplier?: string | null;
  source?: string | null;
  reference?: string | null;
  received_by?: string | null;
  received_at?: string | null;
}

/** One slice of a FIFO plan: how many pieces come from which batch, at what price. */
export interface BatchSlice {
  batch_no: number;
  quantity: number;
  unit_price: number;
}

/** A material's batches, oldest first. */
export const batchesOf = (material?: EntityRow | null): StockBatch[] =>
  (Array.isArray(material?.batches) ? (material!.batches as StockBatch[]) : [])
    .slice()
    .sort((a, b) => Number(a.batch_no) - Number(b.batch_no));

/** Batches that still have stock. */
export const openBatches = (material?: EntityRow | null): StockBatch[] =>
  batchesOf(material).filter((b) => Number(b.quantity_remaining) > 0);

/** The next batch number a restock will get. */
export const nextBatchNo = (material?: EntityRow | null): number =>
  batchesOf(material).reduce((max, b) => Math.max(max, Number(b.batch_no) || 0), 0) + 1;

/** Stock value at each batch's own price (qty × unit price before batches exist). */
export function stockValue(material: EntityRow): number {
  const list = batchesOf(material);
  return list.length
    ? list.reduce((sum, b) => sum + Number(b.quantity_remaining || 0) * Number(b.unit_price || 0), 0)
    : Number(material.quantity || 0) * Number(material.unit_price || 0);
}

/**
 * Which batches `qty` would come out of, oldest first. Stock not on hand is
 * priced at the batch that goes out next (the material's unit price).
 */
export function fifoPlan(material: EntityRow | undefined, qty: number): BatchSlice[] {
  if (!material || !(qty > 0)) return [];
  const slices: BatchSlice[] = [];
  let left = qty;
  for (const batch of batchesOf(material)) {
    if (left <= 0) break;
    const take = Math.min(Number(batch.quantity_remaining) || 0, left);
    if (take <= 0) continue;
    slices.push({ batch_no: Number(batch.batch_no), quantity: take, unit_price: Number(batch.unit_price) || 0 });
    left -= take;
  }
  if (left > 0) slices.push({ batch_no: 0, quantity: left, unit_price: Number(material.unit_price ?? 0) });
  return slices;
}

/** Total of a FIFO plan. */
export const planTotal = (slices: BatchSlice[]): number =>
  Math.round(slices.reduce((sum, s) => sum + s.quantity * s.unit_price, 0) * 100) / 100;
