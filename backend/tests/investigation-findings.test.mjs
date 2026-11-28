// Run with: node --experimental-test-module-mocks --test tests/investigation-findings.test.mjs
//
// The Zone Specialist plans the site visit, then encodes the findings, required
// materials and billing owner. The Commercial Department double-checks them:
// Approve moves the complaint to In Progress; Disapprove (with a reason) sends
// the findings back to the Zone Specialist to correct.
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
const encode = () => update(zone, {
  remarks: 'Leak on the 1/2-inch line before the meter',
  required_materials: [{ material_sku: 'SKU-00001', quantity: 2 }],
  bill_to_customer_id: 'c1',
});

test('the zone specialist plans the site visit; nobody else can', async () => {
  seed({ site_action: '' });
  await update(zone, {
    site_action: 'Visit: Nov 5 (AM)', site_visit_date: '2026-11-05', site_visit_period: 'AM',
    site_visit_companions: [], site_visit_materials: [], site_visit_notes: '',
  });
  assert.equal(incident().site_action, 'Visit: Nov 5 (AM)');
  seed({ site_action: '' });
  await assert.rejects(update(commercial, { site_action: 'Visit: Nov 5 (AM)' }), /Only the Zone Specialist/);
});

test('the zone specialist encodes the findings, which wait for Commercial', async () => {
  seed();
  await encode();
  const row = incident();
  assert.equal(row.status, 'under_verification');
  assert.equal(row.findings_status, 'pending');
  assert.equal(row.remarks, 'Leak on the 1/2-inch line before the meter');
  assert.deepEqual(row.required_materials, [{ material_sku: 'SKU-00001', name: 'PVC Pipe 50mm', quantity: 2, unit: 'pcs' }]);
  assert.equal(row.bill_to_customer_name, 'Carla Customer');
  assert.equal(row.bill_to_serial_number, 'CUST-00001');
  assert.ok(row.findings_submitted_at);
});

test('the zone specialist cannot encode before the site plan, or move the status', async () => {
  seed({ site_action: '' });
  await assert.rejects(update(zone, { remarks: 'Leak' }), /Site Visit Plan/);
  await assert.rejects(update(zone, { bill_to_customer_id: 'c1' }), /Site Visit Plan/);
  seed();
  await assert.rejects(update(zone, { remarks: '   ' }), /Enter the investigation findings/);
  await assert.rejects(update(zone, { status: 'in_progress' }), /Commercial Department/);
  // Nor can the ZS approve their own findings.
  await encode();
  await assert.rejects(update(zone, { findings_status: 'approved' }), /Only the Commercial Department/);
  assert.equal(incident().status, 'under_verification');
});

test('commercial and other roles can no longer type the findings', async () => {
  seed();
  for (const by of [commercial, tech]) {
    await assert.rejects(update(by, { remarks: 'x' }), /Only the Zone Specialist/);
    await assert.rejects(update(by, { bill_to_customer_id: 'c1' }), /Only the Zone Specialist/);
    await assert.rejects(update(by, { required_materials: [] }), /Only the Zone Specialist/);
  }
  assert.equal(incident().remarks, '');
});

test('commercial approves: the complaint moves to In Progress', async () => {
  seed();
  await encode();
  await update(commercial, { findings_status: 'approved' });
  const row = incident();
  assert.equal(row.status, 'in_progress');
  assert.equal(row.findings_status, 'approved');
  assert.equal(row.findings_reviewed_by, 'Cora Commercial');
  assert.equal(row.findings_reason, null);
  // Approved findings are locked for the ZS, and cannot be reviewed twice.
  await assert.rejects(encode(), /approved/);
  await assert.rejects(update(commercial, { findings_status: 'disapproved', findings_reason: 'x' }), /already been reviewed/);
});

test('commercial disapproves with a reason: back to the zone specialist', async () => {
  seed();
  await encode();
  await assert.rejects(update(commercial, { findings_status: 'disapproved' }), /reason/);
  await assert.rejects(update(commercial, { findings_status: 'disapproved', findings_reason: '  ' }), /reason/);
  await update(commercial, { findings_status: 'disapproved', findings_reason: 'No photo of the meter; materials incomplete', status: 'in_progress' });
  let row = incident();
  assert.equal(row.status, 'under_verification');
  assert.equal(row.findings_status, 'disapproved');
  assert.equal(row.findings_reason, 'No photo of the meter; materials incomplete');
  // Nothing more to review until the ZS corrects it.
  await assert.rejects(update(commercial, { findings_status: 'approved' }), /Zone Specialist to correct/);

  // The ZS corrects and resubmits: pending again, reason cleared.
  await encode();
  row = incident();
  assert.equal(row.findings_status, 'pending');
  assert.equal(row.findings_reason, null);
  await update(commercial, { findings_status: 'approved' });
  assert.equal(incident().status, 'in_progress');
});

test('commercial cannot skip the review, or approve what is not there', async () => {
  seed();
  await assert.rejects(update(commercial, { findings_status: 'approved' }), /not encoded the findings/);
  await assert.rejects(update(commercial, { status: 'in_progress' }), /Approve/);
  await assert.rejects(update(commercial, { findings_status: 'maybe' }), /Approve or Disapprove/);
  // Findings with no billing owner cannot be approved for a billable concern…
  seed({ remarks: 'Leak', findings_status: 'pending' });
  await assert.rejects(update(commercial, { findings_status: 'approved' }), /bill/);
  assert.equal(incident().status, 'under_verification');
  // …but water quality / supply concerns are free, so they need none.
  seed({ type: 'no-water', remarks: 'Valve closed upstream', findings_status: 'pending' });
  await update(commercial, { findings_status: 'approved' });
  assert.equal(incident().status, 'in_progress');
});

test('findings encoded before the review step (no status) can still be reviewed', async () => {
  seed({ remarks: 'Leak beside the meter', bill_to_customer_id: 'c1' });
  await update(commercial, { findings_status: 'approved' });
  assert.equal(incident().status, 'in_progress');
});
