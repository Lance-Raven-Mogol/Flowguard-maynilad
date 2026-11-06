// Run with: node --experimental-test-module-mocks --test tests/fifo-batches.test.mjs
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_SECRET_KEY = '';

// In-memory stand-in for the Supabase-backed resource repository.
const tables = new Map();
const table = (name) => (tables.has(name) ? tables.get(name) : tables.set(name, []).get(name));
let seq = 0;
const repo = {
  listRows: async (name) => table(name).filter((r) => !r.archived),
  insertRow: async (name, values) => { const row = { id: `id-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...values }; table(name).push(row); return row; },
  updateRow: async (name, id, values) => { const row = table(name).find((r) => r.id === id); if (!row) return null; Object.assign(row, values); return row; },
  deleteRow: async (name, id) => { tables.set(name, table(name).filter((r) => r.id !== id)); },
  deleteRowsBy: async () => {},
  getRowById: async (name, id) => table(name).find((r) => r.id === id) ?? null,
  findRowsBy: async (name, column, value) => table(name).filter((r) => r[column] === value),
  updateRowsBy: async () => {},
  renameIncidentReporter: async () => {},
};
mock.module('../dist/models/resourceRepo.js', { namedExports: repo });
const { resourceService } = await import('../dist/services/resource.service.js');

const user = (role, fullName) => ({ id: `u-${role}`, role, fullName, email: `${role}@x.com`, createdAt: '' });
const leader = user('inhouse-team', 'Lea Leader');
const inventory = user('inventory-officer', 'Ivy Inventory');
const gm = user('general-manager', 'Gina Manager');
const tech = user('technical-team', 'Tess Tech');

const batchesOf = (materialId) =>
  table('material_batches').filter((b) => b.material_id === materialId).sort((a, b) => a.batch_no - b.batch_no);
const remaining = (materialId) => batchesOf(materialId).map((b) => [b.batch_no, b.quantity_remaining, b.unit_price]);

function seed() {
  tables.clear();
  table('job_orders').push({ id: 'jo1', ref_code: 'JO-2026-001', status: 'in_progress', team_leader: 'Lea Leader' });
}

/** New item with 10 pcs @ ₱100, then a restock of 5 pcs @ ₱120. */
async function pipeWithTwoBatches() {
  const pipe = await resourceService.create('materials', inventory, {
    name: 'PVC Pipe 50mm', unit: 'pcs', quantity: 10, unit_price: 100, min_level: 2, safety_level: 0,
  });
  await resourceService.update('materials', inventory, pipe.id, { quantity: 15, restock: true, restock_unit_price: 120 });
  return table('materials').find((m) => m.id === pipe.id);
}

async function approveMrf(sku, quantity) {
  const mrf = await resourceService.create('material-requests', leader, {
    request_type: 'mrf', job_order_ref: 'JO-2026-001', items: [{ material_sku: sku, quantity }],
  });
  await resourceService.update('material-requests', inventory, mrf.id, { status: 'verified' });
  await resourceService.update('material-requests', gm, mrf.id, { status: 'approved' });
  return table('material_requests').find((r) => r.id === mrf.id);
}

test('adding an item makes batch #1; a restock needs its own price and makes a new batch', async () => {
  seed();
  await assert.rejects(
    resourceService.create('materials', inventory, { name: 'Valve', quantity: 5 }),
    /unit price \(per piece\) of this first batch/,
  );
  const pipe = await resourceService.create('materials', inventory, { name: 'PVC Pipe 50mm', unit: 'pcs', quantity: 10, unit_price: 100 });
  assert.deepEqual(remaining(pipe.id), [[1, 10, 100]]);

  await assert.rejects(
    resourceService.update('materials', inventory, pipe.id, { quantity: 15, restock: true }),
    /unit price \(per piece\) of this restock batch/,
  );
  await resourceService.update('materials', inventory, pipe.id, { quantity: 15, restock: true, restock_unit_price: 120 });
  assert.deepEqual(remaining(pipe.id), [[1, 10, 100], [2, 5, 120]], 'same product, new batch');
  const row = table('materials').find((m) => m.id === pipe.id);
  assert.equal(row.quantity, 15);
  assert.equal(row.unit_price, 100, 'the oldest batch goes out first, so it sets the price');
  const log = table('audit_logs').filter((l) => l.entity === 'materials').at(-1);
  assert.equal(log.details.movement_type, 'stock_in');
  assert.equal(log.details.batch_no, 2);
});

test('stock leaves the oldest batch first and is priced from the batches it came out of', async () => {
  seed();
  const pipe = await pipeWithTwoBatches();
  const mrf = await approveMrf(pipe.sku, 12);
  assert.deepEqual(remaining(pipe.id), [[1, 0, 100], [2, 3, 120]]);
  assert.equal(pipe.quantity, 3);
  assert.equal(pipe.unit_price, 120, 'batch #1 is used up — the next price is batch #2');
  assert.equal(mrf.total_cost, 1240, '10 × ₱100 + 2 × ₱120');
  assert.deepEqual(mrf.items[0].batches.map((b) => [b.batch_no, b.quantity, b.unit_price]), [[1, 10, 100], [2, 2, 120]]);
  const out = table('audit_logs').find((l) => l.details?.movement_type === 'stock_out');
  assert.equal(out.details.total_cost, 1240);
});

test('the price breakdown is priced FIFO, one line per batch price', async () => {
  seed();
  const pipe = await pipeWithTwoBatches();
  table('incidents').push({ id: 'i1', ref_code: 'INC-0001', type: 'leak', status: 'in_progress' });
  await resourceService.update('incidents', tech, 'i1', {
    charges: [
      { kind: 'material', material_sku: pipe.sku, quantity: 8 },
      { kind: 'material', material_sku: pipe.sku, quantity: 4 }, // same item twice — priced once
      { kind: 'labor', description: 'Labor', amount: 500 },
    ],
  });
  const incident = table('incidents').find((i) => i.id === 'i1');
  assert.deepEqual(incident.charges.map((c) => [c.description, c.quantity, c.unit_price, c.amount]), [
    ['PVC Pipe 50mm (Batch #1)', 10, 100, 1000],
    ['PVC Pipe 50mm (Batch #2)', 2, 120, 240],
    ['Labor', 1, 500, 500],
  ]);
  assert.equal(incident.estimated_cost, 1740);
  assert.deepEqual(remaining(pipe.id), [[1, 10, 100], [2, 5, 120]], 'pricing does not take stock out');
});

test('usable leftovers go back to the batch they were released from', async () => {
  seed();
  const pipe = await pipeWithTwoBatches();
  await approveMrf(pipe.sku, 12);
  table('job_orders')[0].status = 'completed';
  await resourceService.update('materials', leader, pipe.id, { return_job_order_ref: 'JO-2026-001', return_quantity: 3, name: 'hijack' });
  assert.deepEqual(remaining(pipe.id), [[1, 1, 100], [2, 5, 120]], '2 back to batch #2, then 1 to batch #1');
  assert.equal(pipe.quantity, 6);
  assert.equal(pipe.unit_price, 100, 'the returned batch #1 piece goes out first again');
  assert.equal(pipe.name, 'PVC Pipe 50mm', 'a return only changes stock');
});

test('a stock count shortage leaves the oldest batch first; editing the price fixes the current batch', async () => {
  seed();
  const pipe = await pipeWithTwoBatches();
  await resourceService.update('materials', inventory, pipe.id, { quantity: 4, stock_count: true });
  assert.deepEqual(remaining(pipe.id), [[1, 0, 100], [2, 4, 120]]);
  await resourceService.update('materials', inventory, pipe.id, { quantity: 4, unit_price: 125 });
  assert.deepEqual(remaining(pipe.id), [[1, 0, 100], [2, 4, 125]]);
  assert.equal(pipe.unit_price, 125);
});

test('items from before batches get an opening batch at their price', async () => {
  seed();
  table('materials').push({ id: 'old', sku: 'SKU-00009', name: 'Gate Valve', unit: 'pcs', quantity: 6, unit_price: 80, min_level: 1, safety_level: 0, status: 'in_stock' });
  await resourceService.update('materials', inventory, 'old', { quantity: 10, restock: true, restock_unit_price: 90 });
  assert.deepEqual(remaining('old'), [[1, 6, 80], [2, 4, 90]]);
  const listed = (await resourceService.list('materials', inventory)).find((m) => m.id === 'old');
  assert.equal(listed.batches.length, 2);
});

test('the job order shows what its materials actually cost; the final bill charges that', async () => {
  seed();
  const commercial = user('commercial-department', 'Cora Commercial');
  const pipe = await pipeWithTwoBatches();
  table('incidents').push({ id: 'i1', ref_code: 'INC-0001', type: 'leak', status: 'in_progress' });
  table('job_orders')[0].incident_ref = 'INC-0001';
  await resourceService.update('incidents', tech, 'i1', {
    charges: [{ kind: 'material', material_sku: pipe.sku, quantity: 3 }, { kind: 'labor', description: 'Labor', amount: 500 }],
  });
  assert.equal(table('incidents')[0].estimated_cost, 800, 'quoted 3 × ₱100 + labor');

  // The job used more than quoted: 12 released (10 × ₱100 + 2 × ₱120), then 2 usable leftovers came back.
  await approveMrf(pipe.sku, 12);
  table('job_orders')[0].status = 'completed';
  await resourceService.update('materials', leader, pipe.id, { return_job_order_ref: 'JO-2026-001', return_quantity: 2 });

  const jo = (await resourceService.list('job-orders', commercial))[0];
  assert.equal(jo.material_cost.released_total, 1240);
  assert.equal(jo.material_cost.returned_total, 240, 'the 2 returned came from batch #2');
  assert.equal(jo.material_cost.total, 1000, '10 used, all from batch #1');
  assert.equal(jo.material_cost.billed, 300, 'what the price breakdown charged for materials');
  assert.deepEqual(jo.material_cost.items[0].batches.map((b) => [b.batch_no, b.quantity]), [[1, 10]]);
  const customerView = (await resourceService.list('job-orders', user('customer', 'Cruz Customer')))[0];
  assert.equal(customerView?.material_cost, undefined, 'internal cost is not shown to customers');

  const bill = await resourceService.create('payments', commercial, {
    customer_name: 'x', customer_email: 'x@x.com', amount: 1, job_order_ref: 'JO-2026-001',
  });
  assert.deepEqual(bill.charges.map((c) => [c.description, c.quantity, c.unit_price, c.amount]), [
    ['PVC Pipe 50mm', 10, 100, 1000],
    ['Labor', 1, 500, 500],
  ]);
  assert.equal(bill.amount, 1500);
});
