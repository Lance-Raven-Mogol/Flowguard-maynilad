// Run with: node --experimental-test-module-mocks --test tests/mrf-workflow.test.mjs
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
  insertRow: async (name, values) => { const row = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...values }; table(name).push(row); return row; },
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
const other = user('contractor', 'Carl Other');
const inventory = user('inventory-officer', 'Ivy Inventory');
const gm = user('general-manager', 'Gina Manager');

function seed() {
  tables.clear();
  table('materials').push(
    { id: 'm1', sku: 'SKU-00001', name: 'PVC Pipe 50mm', unit: 'pcs', quantity: 20, min_level: 5, status: 'in_stock' },
    { id: 'm2', sku: 'SKU-00002', name: 'Gate Valve', unit: 'pcs', quantity: 3, min_level: 1, status: 'in_stock' },
  );
  table('job_orders').push({ id: 'jo1', ref_code: 'JO-2026-001', status: 'in_progress', team_leader: 'Lea Leader' });
}

const fileMrf = (by = leader, items = [
  { material_sku: 'SKU-00001', quantity: 4 },
  { material_sku: 'SKU-00002', quantity: 2 },
  { material_name: 'Teflon tape', quantity: 1 },
]) => resourceService.create('material-requests', by, { request_type: 'mrf', job_order_ref: 'JO-2026-001', items, status: 'approved' });

test('team leader files one MRF with several materials', async () => {
  seed();
  const mrf = await fileMrf(leader, [
    { material_sku: 'SKU-00001', material_name: 'wrong name', quantity: 4 },
    { material_sku: 'SKU-00001', quantity: 1 },
    { material_sku: 'SKU-00002', quantity: 2 },
  ]);
  assert.equal(mrf.status, 'pending', 'always starts pending');
  assert.equal(mrf.requested_by, 'Lea Leader');
  assert.deepEqual(mrf.items.map((i) => [i.material_sku, i.material_name, i.quantity]), [
    ['SKU-00001', 'PVC Pipe 50mm', 5],
    ['SKU-00002', 'Gate Valve', 2],
  ]);
  assert.equal(mrf.material_name, 'PVC Pipe 50mm +1 more');

  await assert.rejects(fileMrf(other), /Only the team leader/);
  await assert.rejects(fileMrf(leader, [{ material_sku: 'SKU-00001', quantity: 0 }]), /quantity greater than 0/);
  await assert.rejects(fileMrf(leader, [{ material_sku: 'SKU-99999', quantity: 1 }]), /No active inventory item/);
});

test('inventory verifies → GM approves (stock deducted) → inventory releases', async () => {
  seed();
  const mrf = await fileMrf();
  const move = (by, status) => resourceService.update('material-requests', by, mrf.id, { status });

  await assert.rejects(move(gm, 'approved'), /cannot be moved/);
  await assert.rejects(move(leader, 'verified'), /Only the Inventory Officer can verify/);
  await move(inventory, 'verified');
  assert.equal(mrf.verified_by, 'Ivy Inventory');

  await assert.rejects(move(inventory, 'approved'), /Only the General Manager can approve/);
  await move(gm, 'approved');
  assert.equal(mrf.approved_by, 'Gina Manager');
  assert.equal(table('materials').find((m) => m.id === 'm1').quantity, 16);
  assert.equal(table('materials').find((m) => m.id === 'm2').quantity, 1);

  await assert.rejects(move(gm, 'released'), /Only the Inventory Officer can release/);
  await move(inventory, 'released');
  assert.equal(mrf.released_by, 'Ivy Inventory');
  assert.equal(table('materials').find((m) => m.id === 'm1').quantity, 16, 'no double deduction');
  assert.equal(table('audit_logs').filter((l) => l.details.movement_type === 'stock_out').length, 2);
});

test('verification and approval are blocked when stock is short', async () => {
  seed();
  const mrf = await fileMrf(leader, [{ material_sku: 'SKU-00002', quantity: 5 }]);
  await assert.rejects(
    resourceService.update('material-requests', inventory, mrf.id, { status: 'verified' }),
    /Insufficient stock — "Gate Valve" \(SKU-00002\): 2 available after 1 safety stock, 5 requested/,
  );
  await resourceService.update('material-requests', inventory, mrf.id, { status: 'rejected' });
  assert.equal(mrf.status, 'rejected');

  // Stock taken by another request between verification and approval.
  const second = await fileMrf(leader, [{ material_sku: 'SKU-00002', quantity: 2 }]);
  await resourceService.update('material-requests', inventory, second.id, { status: 'verified' });
  table('materials').find((m) => m.id === 'm2').quantity = 1;
  await assert.rejects(resourceService.update('material-requests', gm, second.id, { status: 'approved' }), /Insufficient stock/);
  assert.equal(second.status, 'verified');
});

test('inventory officer sees every MRF; leaders see only their own', async () => {
  seed();
  await fileMrf();
  table('material_requests').push({ id: 'x', request_type: 'general', requested_by: 'Someone', status: 'pending' });
  assert.equal((await resourceService.list('material-requests', inventory)).length, 1);
  assert.equal((await resourceService.list('material-requests', leader)).length, 1);
  assert.equal((await resourceService.list('material-requests', other)).length, 0);
});

test('safety stock is never released — a material cannot reach 0 through an MRF', async () => {
  seed();
  // Gate Valve: 3 in stock, default safety stock 1 → only 2 can go out.
  const all = await fileMrf(leader, [{ material_sku: 'SKU-00002', quantity: 3 }]);
  await assert.rejects(
    resourceService.update('material-requests', inventory, all.id, { status: 'verified' }),
    /2 available after 1 safety stock, 3 requested/,
  );
  table('materials').find((m) => m.id === 'm2').safety_level = 0;
  await resourceService.update('material-requests', inventory, all.id, { status: 'verified' });
  table('materials').find((m) => m.id === 'm2').safety_level = 2;
  await assert.rejects(resourceService.update('material-requests', gm, all.id, { status: 'approved' }), /1 available after 2 safety stock/);
});

test('stock count logs system vs. actual', async () => {
  seed();
  await resourceService.update('materials', inventory, 'm1', { quantity: 17, stock_count: true, stock_count_note: 'Shelf A' });
  assert.equal(table('materials').find((m) => m.id === 'm1').quantity, 17);
  const log = table('audit_logs').at(-1);
  assert.equal(log.details.movement_type, 'stock_count');
  assert.deepEqual([log.details.system_quantity, log.details.counted_quantity, log.details.variance], [20, 17, -3]);
  assert.equal(log.details.reference, 'Shelf A');
});

test('walk-in cash: staff record it with an OR number; bill paid and complaint resolved', async () => {
  seed();
  const commercial = user('commercial-department', 'Cora Commercial');
  const customer = { ...user('customer', 'Cruz Customer'), id: 'c1' };
  table('incidents').push({ id: 'i1', ref_code: 'INC-0001', status: 'for_billing' });
  table('payments').push({ id: 'p1', ref_code: 'PAY-00001', customer_id: 'c1', amount: 500, status: 'pending', incident_ref: 'INC-0001' });
  const cash = { payment_method: 'Cash (Walk-in)', amount_paid: 500, payment_date: '2026-09-26' };

  await assert.rejects(resourceService.update('payments', commercial, 'p1', cash), /Official Receipt/);
  await assert.rejects(resourceService.update('payments', inventory, 'p1', { ...cash, payment_reference: 'OR-1' }), /Only the Commercial Department or General Manager/);
  await assert.rejects(
    resourceService.update('payments', customer, 'p1', { ...cash, payment_reference: 'OR-1', payment_proof: ['x'] }),
    /made at the office/,
  );
  await resourceService.update('payments', commercial, 'p1', { ...cash, payment_reference: 'OR-1' });
  const bill = table('payments').find((p) => p.id === 'p1');
  assert.equal(bill.status, 'paid');
  assert.equal(bill.recorded_by, 'Cora Commercial');
  assert.equal(bill.paid_date, '2026-09-26');
  assert.equal(table('incidents').find((i) => i.id === 'i1').status, 'resolved');
  await assert.rejects(resourceService.update('payments', commercial, 'p1', { ...cash, payment_reference: 'OR-2' }), /already paid/);
});

test('technical team prices with a breakdown; the bill is exactly that total', async () => {
  seed();
  const tech = user('technical-team', 'Tess Tech');
  const commercial = user('commercial-department', 'Cora Commercial');
  table('materials').find((m) => m.id === 'm1').unit_price = 150;
  table('app_users').push({ id: 'c1', role: 'customer', full_name: 'Cruz Customer', email: 'c@x.com' });
  table('incidents').push({ id: 'i1', ref_code: 'INC-0001', type: 'leak', status: 'in_progress', bill_to_customer_id: 'c1' });
  const charges = [
    { kind: 'material', material_sku: 'SKU-00001', quantity: 2, unit_price: 1 }, // price from inventory, not the client
    { kind: 'labor', description: 'Labor — 2 plumbers', amount: 800 },
    { kind: 'fee', description: 'Excavation permit', amount: 250.5 },
  ];

  await assert.rejects(resourceService.update('incidents', tech, 'i1', { charges: [] }), /at least one charge/);
  await assert.rejects(
    resourceService.update('incidents', tech, 'i1', { charges: [{ kind: 'material', material_sku: 'SKU-00002', quantity: 1 }] }),
    /no unit price/,
  );
  // The tech team no longer decides "no charge".
  await resourceService.update('incidents', tech, 'i1', { billable: false });
  assert.equal(table('incidents').find((i) => i.id === 'i1').status, 'in_progress');

  await resourceService.update('incidents', tech, 'i1', { charges, status: 'for_estimation' });
  const incident = table('incidents').find((i) => i.id === 'i1');
  assert.equal(incident.status, 'for_estimation');
  assert.equal(incident.estimated_cost, 1350.5);
  assert.deepEqual(incident.charges.map((c) => c.amount), [300, 800, 250.5]);
  await assert.rejects(resourceService.update('incidents', tech, 'i1', { charges }), /only be set while the complaint is Ongoing/);

  const bill = await resourceService.create('payments', commercial, {
    customer_name: 'x', customer_email: 'x@x.com', amount: 1, incident_ref: 'INC-0001', due_date: '2026-10-01',
  });
  assert.equal(bill.amount, 1350.5, 'bill amount is locked to the price');
  assert.equal(bill.charges.length, 3);
});

test('no charge: commercial department resolves a priced complaint with no bill', async () => {
  seed();
  const tech = user('technical-team', 'Tess Tech');
  const commercial = user('commercial-department', 'Cora Commercial');
  table('materials').find((m) => m.id === 'm1').unit_price = 150;
  table('incidents').push({ id: 'i2', ref_code: 'INC-0002', type: 'odor-water', status: 'in_progress' });

  await assert.rejects(resourceService.update('incidents', commercial, 'i2', { billable: false, status: 'resolved' }), /Priced and not yet billed/);
  await resourceService.update('incidents', tech, 'i2', { charges: [{ kind: 'material', material_sku: 'SKU-00001', quantity: 1 }], status: 'for_estimation' });
  await resourceService.update('incidents', commercial, 'i2', { billable: false, status: 'resolved' });
  const incident = table('incidents').find((i) => i.id === 'i2');
  assert.equal(incident.status, 'resolved');
  assert.equal(incident.billable, false);
  assert.equal(incident.estimated_cost, 150, 'the price stays on record');
  await assert.rejects(
    resourceService.create('payments', commercial, { customer_name: 'x', customer_email: 'x@x.com', amount: 100, incident_ref: 'INC-0002' }),
    /covered by the utility/,
  );
  // Customers can't flip a complaint to no charge.
  table('incidents').push({ id: 'i3', ref_code: 'INC-0003', type: 'leak', status: 'for_estimation', reported_by_id: 'u-customer' });
  await resourceService.update('incidents', user('customer', 'Cruz Customer'), 'i3', { billable: false, description: 'x' });
  assert.notEqual(table('incidents').find((i) => i.id === 'i3').billable, false);
});
