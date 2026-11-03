// Run with: node --experimental-test-module-mocks --test tests/required-materials.test.mjs
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
const zone = user('zone-specialist', 'Zed Zone');
const tech = user('technical-team', 'Tom Tech');
const leader = user('inhouse-team', 'Lea Leader');

function seed(incident = {}) {
  tables.clear();
  table('materials').push(
    { id: 'm1', sku: 'SKU-00001', name: 'PVC Pipe 50mm', unit: 'pcs', quantity: 20, unit_price: 150, status: 'in_stock' },
    { id: 'm2', sku: 'SKU-00002', name: 'Gate Valve', unit: 'pcs', quantity: 3, unit_price: 800, status: 'in_stock' },
  );
  table('incidents').push({ id: 'inc1', ref_code: 'INC-0001', status: 'in_progress', site_action: 'Visit: Nov 3 (AM)', ...incident });
}
const setMaterials = (by, list) => resourceService.update('incidents', by, 'inc1', { required_materials: list });

test('zone specialist lists required materials once; names and units come from inventory', async () => {
  seed();
  const row = await setMaterials(zone, [
    { material_sku: 'SKU-00001', name: 'wrong', quantity: 2 },
    { material_sku: 'SKU-00002', quantity: 1 },
  ]);
  assert.deepEqual(row.required_materials, [
    { material_sku: 'SKU-00001', name: 'PVC Pipe 50mm', quantity: 2, unit: 'pcs' },
    { material_sku: 'SKU-00002', name: 'Gate Valve', quantity: 1, unit: 'pcs' },
  ]);
  await assert.rejects(setMaterials(zone, [{ material_sku: 'SKU-00001', quantity: 1 }, { material_sku: 'SKU-00001', quantity: 2 }]), /listed twice/);
  await assert.rejects(setMaterials(zone, [{ material_sku: 'SKU-00001', quantity: 1.5 }]), /whole-number/);
  await assert.rejects(setMaterials(zone, [{ material_sku: 'SKU-99999', quantity: 1 }]), /No active inventory item/);
});

test('only the zone specialist sets them, after the site plan and before pricing', async () => {
  seed();
  await assert.rejects(setMaterials(tech, []), /Zone Specialist/);
  await assert.rejects(setMaterials(leader, []), /permission|Zone Specialist/);
  seed({ site_action: '' });
  await assert.rejects(setMaterials(zone, []), /Site Visit Plan/);
  seed({ status: 'for_estimation' });
  await assert.rejects(setMaterials(zone, []), /priced/);
});

const commercial = user('commercial-department', 'Cora Commercial');
const sitePlan = (materials) => resourceService.update('incidents', zone, 'inc1', {
  site_action: 'Visit: Nov 5 (AM)',
  site_visit_date: '2026-11-05',
  site_visit_period: 'AM',
  site_visit_companions: [],
  site_visit_materials: materials,
  site_visit_notes: '',
});
const stockOf = (id) => table('materials').find((m) => m.id === id).quantity;

test('materials brought on the site visit are taken out of stock once the plan is saved', async () => {
  seed({ site_action: '', status: 'under_verification' });
  await sitePlan([{ material_sku: 'SKU-00001', quantity: 3 }]);
  assert.equal(stockOf('m1'), 17);
  // The plan locks after its first save, so the stock can't be taken twice.
  await assert.rejects(sitePlan([{ material_sku: 'SKU-00001', quantity: 3 }]), /locked/);
  assert.equal(stockOf('m1'), 17);
});

test('a site visit plan that needs more than the available stock is not saved', async () => {
  seed({ site_action: '', status: 'under_verification' });
  // 3 Gate Valves in stock, 1 kept as safety stock → only 2 can be taken.
  await assert.rejects(sitePlan([{ material_sku: 'SKU-00002', quantity: 3 }]), /Insufficient stock/);
  assert.equal(stockOf('m2'), 3);
  assert.equal(table('incidents')[0].site_action, '');
});

test('creating the job order auto-files an MRF with the required materials, visible to its team leader', async () => {
  seed({ status: 'resolved', required_materials: [{ material_sku: 'SKU-00001', name: 'PVC Pipe 50mm', quantity: 2, unit: 'pcs' }] });
  const jo = await resourceService.create('job-orders', commercial, { title: 'Fix leak', incident_ref: 'INC-0001' });
  const mrfs = table('material_requests');
  assert.equal(mrfs.length, 1);
  assert.equal(mrfs[0].request_type, 'mrf');
  assert.equal(mrfs[0].status, 'pending');
  assert.equal(mrfs[0].job_order_ref, jo.ref_code);
  assert.deepEqual(mrfs[0].items, [{ material_sku: 'SKU-00001', material_name: 'PVC Pipe 50mm', quantity: 2, unit: 'pcs' }]);
  // Stock only moves when the MRF is approved, not when it is filed.
  assert.equal(stockOf('m1'), 20);

  assert.equal((await resourceService.list('material-requests', leader)).length, 0);
  table('job_orders')[0].team_leader = 'Lea Leader';
  assert.equal((await resourceService.list('material-requests', leader)).length, 1);
});

test('no MRF is filed when the complaint has no required materials', async () => {
  seed({ status: 'resolved', required_materials: [] });
  await resourceService.create('job-orders', commercial, { title: 'Fix leak', incident_ref: 'INC-0001' });
  assert.equal(table('material_requests').length, 0);
});
