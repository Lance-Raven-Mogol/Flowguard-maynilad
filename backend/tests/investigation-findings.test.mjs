// Run with: node --experimental-test-module-mocks --test tests/investigation-findings.test.mjs
//
// #3: the Zone Specialist plans the site visit and fills in the printed
// Investigation Form; the Commercial Department encodes its findings, required
// materials and billing owner, which moves the complaint to In Progress.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_SECRET_KEY = '';

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
const commercial = user('commercial-department', 'Cora Commercial');
const tech = user('technical-team', 'Tom Tech');

function seed(incident = {}) {
  tables.clear();
  table('materials').push({ id: 'm1', sku: 'SKU-00001', name: 'PVC Pipe 50mm', unit: 'pcs', quantity: 20, unit_price: 150, status: 'in_stock' });
  table('app_users').push({ id: 'c1', role: 'customer', full_name: 'Carla Customer', serial_number: 'CUST-00001', is_archived: false });
  table('incidents').push({
    id: 'inc1', ref_code: 'INC-0001', type: 'leak', status: 'under_verification', urgency: 'high',
    site_action: 'Visit: Nov 5 (AM)', remarks: '', ...incident,
  });
}
const incident = () => table('incidents')[0];
const update = (by, values) => resourceService.update('incidents', by, 'inc1', values);

test('the zone specialist still plans the site visit', async () => {
  seed({ site_action: '' });
  await update(zone, {
    site_action: 'Visit: Nov 5 (AM)', site_visit_date: '2026-11-05', site_visit_period: 'AM',
    site_visit_companions: [], site_visit_materials: [], site_visit_notes: '',
  });
  assert.equal(incident().site_action, 'Visit: Nov 5 (AM)');
  // …but nobody else can.
  seed({ site_action: '' });
  await assert.rejects(update(commercial, { site_action: 'Visit: Nov 5 (AM)' }), /Only the Zone Specialist/);
});

test('the zone specialist can no longer type findings, pick the billing owner or move the status', async () => {
  seed();
  await assert.rejects(update(zone, { remarks: 'Leak beside the meter' }), /Commercial Department/);
  await assert.rejects(update(zone, { bill_to_customer_id: 'c1' }), /Commercial Department/);
  await assert.rejects(update(zone, { status: 'in_progress' }), /Commercial Department/);
  assert.equal(incident().status, 'under_verification');
  assert.equal(incident().remarks, '');
});

test('commercial encodes the investigation form and moves the complaint to In Progress', async () => {
  seed();
  await update(commercial, {
    remarks: 'Leak on the 1/2-inch line before the meter',
    required_materials: [{ material_sku: 'SKU-00001', quantity: 2 }],
    bill_to_customer_id: 'c1',
    status: 'in_progress',
  });
  const row = incident();
  assert.equal(row.status, 'in_progress');
  assert.equal(row.remarks, 'Leak on the 1/2-inch line before the meter');
  assert.deepEqual(row.required_materials, [{ material_sku: 'SKU-00001', name: 'PVC Pipe 50mm', quantity: 2, unit: 'pcs' }]);
  assert.equal(row.bill_to_customer_name, 'Carla Customer');
  assert.equal(row.bill_to_serial_number, 'CUST-00001');
});

test('commercial cannot encode before the site visit plan, or skip findings / billing owner', async () => {
  seed({ site_action: '' });
  await assert.rejects(update(commercial, { bill_to_customer_id: 'c1' }), /Site Visit Plan/);
  await assert.rejects(update(commercial, { remarks: 'x', status: 'in_progress' }), /Site Visit Plan/);
  seed();
  await assert.rejects(update(commercial, { bill_to_customer_id: 'c1', status: 'in_progress' }), /findings/);
  await assert.rejects(update(commercial, { remarks: 'Leak', status: 'in_progress' }), /bill/);
  assert.equal(incident().status, 'under_verification');
  // Water quality / supply concerns are free, so they need no billing owner.
  seed({ type: 'no-water' });
  await update(commercial, { remarks: 'Valve closed upstream', status: 'in_progress' });
  assert.equal(incident().status, 'in_progress');
});

test('other roles cannot encode findings', async () => {
  seed();
  await assert.rejects(update(tech, { remarks: 'x' }), /Commercial Department/);
  await assert.rejects(update(tech, { bill_to_customer_id: 'c1' }), /Commercial Department/);
});
