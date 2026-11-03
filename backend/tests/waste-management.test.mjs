// Run with: node --experimental-test-module-mocks --test tests/waste-management.test.mjs
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
const tech = user('technical-team', 'Tom Tech');

const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';

function seed() {
  tables.clear();
  table('job_orders').push({ id: 'jo1', ref_code: 'JO-2026-001', status: 'completed', team_leader: 'Lea Leader' });
  table('material_requests').push({
    id: 'mrf1', ref_code: 'REQ-0001', request_type: 'mrf', job_order_ref: 'JO-2026-001', status: 'released',
    items: [{ material_sku: 'SKU-00001', material_name: 'PVC Pipe 50mm', quantity: 5, unit: 'pcs' }],
  });
}

const report = (by = leader, body = {}) => resourceService.create('waste-disposals', by, {
  job_order_ref: 'JO-2026-001', material_sku: 'SKU-00001', material_name: 'PVC Pipe 50mm',
  quantity: 2, unit: 'pcs', condition: 'damaged', remarks: 'cracked', status: 'verified', ...body,
});

test('team leader reports a Not in Good Condition item', async () => {
  seed();
  const row = await report();
  assert.equal(row.status, 'pending_disposal', 'always starts pending, whatever the client sends');
  assert.equal(row.reported_by, 'Lea Leader');
  assert.equal(row.mrf_id, 'mrf1');
  assert.match(row.ref_code, /^WST-\d{5}$/);
  const log = table('audit_logs').find((l) => l.action === 'leftover_log');
  assert.equal(log.entity, 'material-requests');
  assert.equal(log.details.qty_leftover, 2);
  assert.equal(log.details.job_order_ref, 'JO-2026-001', 'counts as already logged on Log Leftovers');
});

test('only the team leader of a completed job order can report', async () => {
  seed();
  await assert.rejects(report(other), /team leader/);
  await assert.rejects(report(inventory), /team leader/);
  await assert.rejects(report(leader, { quantity: 9 }), /Only 5 pcs/);
  await assert.rejects(report(leader, { material_sku: 'SKU-99999' }), /not released/);
  table('job_orders')[0].status = 'in_progress';
  await assert.rejects(report(), /completed job order/);
});

test('inventory disposes with photo proof, then the GM verifies', async () => {
  seed();
  const row = await report();

  await assert.rejects(resourceService.update('waste-disposals', leader, row.id, { status: 'disposed' }), /Inventory Officer/);
  await assert.rejects(
    resourceService.update('waste-disposals', inventory, row.id, { status: 'disposed', disposal_method: 'Scrap', disposal_location: 'Boac MRF', disposal_images: [] }),
    /photo/,
  );
  await assert.rejects(resourceService.update('waste-disposals', inventory, row.id, { status: 'verified' }), /General Manager/);

  const disposed = await resourceService.update('waste-disposals', inventory, row.id, {
    status: 'disposed', disposal_method: 'Scrap', disposal_location: 'Boac MRF', disposal_images: [PHOTO],
    quantity: 99, material_name: 'tampered',
  });
  assert.equal(disposed.status, 'disposed');
  assert.equal(disposed.disposed_by, 'Ivy Inventory');
  assert.equal(disposed.quantity, 2, 'reported fields cannot be changed');
  assert.equal(disposed.material_name, 'PVC Pipe 50mm');
  const audit = table('audit_logs').find((l) => l.entity === 'waste-disposals' && l.action === 'update');
  assert.equal(audit.details.disposal_photo_count, 1);
  assert.equal(audit.details.disposal_images, undefined, 'photos are not copied into the audit log');

  await assert.rejects(resourceService.update('waste-disposals', gm, row.id, { status: 'rejected' }), /reason/);
  const rejected = await resourceService.update('waste-disposals', gm, row.id, { status: 'rejected', verification_notes: 'Photo is blurry' });
  assert.equal(rejected.status, 'rejected');

  await resourceService.update('waste-disposals', inventory, row.id, {
    status: 'disposed', disposal_method: 'Scrap', disposal_location: 'Boac MRF', disposal_images: [PHOTO, PHOTO],
  });
  const verified = await resourceService.update('waste-disposals', gm, row.id, { status: 'verified' });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verified_by, 'Gina Manager');
  await assert.rejects(resourceService.update('waste-disposals', inventory, row.id, {
    status: 'disposed', disposal_method: 'Scrap', disposal_location: 'x', disposal_images: [PHOTO],
  }), /cannot be disposed again/);
});

test('who can see waste records', async () => {
  seed();
  await report();
  assert.equal((await resourceService.list('waste-disposals', inventory)).length, 1);
  assert.equal((await resourceService.list('waste-disposals', gm)).length, 1);
  assert.equal((await resourceService.list('waste-disposals', leader)).length, 1);
  assert.equal((await resourceService.list('waste-disposals', other)).length, 0, 'field teams see only their own');
  await assert.rejects(resourceService.list('waste-disposals', tech), /Inventory Officer and General Manager/);
  const id = table('waste_disposals')[0].id;
  await assert.rejects(resourceService.remove('waste-disposals', inventory, id), /cannot be deleted/);
});
