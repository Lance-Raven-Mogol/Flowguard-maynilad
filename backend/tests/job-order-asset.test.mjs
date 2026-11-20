// Run with: node --experimental-test-module-mocks --test tests/job-order-asset.test.mjs
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_SECRET_KEY = '';

// In-memory stand-in for the Supabase-backed resource repository.
const tables = new Map();
const table = (name) => (tables.has(name) ? tables.get(name) : tables.set(name, []).get(name));
let seq = 0;
let failUpdates = false;
const repo = {
  listRows: async (name) => table(name).filter((r) => !r.archived),
  insertRow: async (name, values) => { const row = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...values }; table(name).push(row); return row; },
  updateRow: async (name, id, values) => { if (failUpdates) throw new Error('db down'); const row = table(name).find((r) => r.id === id); if (!row) return null; Object.assign(row, values); return row; },
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
const member = user('contractor', 'Carl Member');

function seed(status = 'in_progress') {
  tables.clear();
  table('job_orders').push({
    id: 'jo1', ref_code: 'JO-2026-001', title: 'New service line', status,
    team_leader: 'Lea Leader', team_members: ['Lea Leader', 'Carl Member'],
  });
}
const complete = (by, extra = {}) => resourceService.update('job-orders', by, 'jo1', { status: 'completed', ...extra });
const job = () => table('job_orders')[0];

test('the team leader cannot complete a job order without registering an asset or giving a reason', async () => {
  seed();
  await assert.rejects(complete(leader), /Register the installed asset/);
  assert.equal(job().status, 'in_progress');
  assert.equal(table('assets').length, 0);
});

test('completing with an asset registers it, linked to the job order', async () => {
  seed();
  await complete(leader, {
    completion_asset: { name: 'Service Line 25mm', type: 'Pipe', location: 'Purok 1, Brgy. Tabi, Boac', asset_tag: 'HACK', job_order_ref: 'OTHER' },
  });
  const [asset] = table('assets');
  assert.equal(asset.name, 'Service Line 25mm');
  assert.equal(asset.job_order_ref, 'JO-2026-001');
  assert.match(asset.asset_tag, /^AST-\d{5}$/);
  assert.equal(asset.condition, 'good');
  assert.match(String(asset.install_date), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(job().status, 'completed');
  assert.equal(job().asset_tag, asset.asset_tag);
});

test('the installed asset needs a name', async () => {
  seed();
  await assert.rejects(complete(leader, { completion_asset: { name: '  ', type: 'Pipe' } }), /name of the installed asset/);
  assert.equal(job().status, 'in_progress');
});

test('completing without a new asset records the reason', async () => {
  seed();
  await complete(leader, { no_asset_reason: 'Repair only: patched the existing main' });
  assert.equal(job().status, 'completed');
  assert.equal(job().no_asset_reason, 'Repair only: patched the existing main');
  assert.equal(table('assets').length, 0);
});

test('only the team leader can complete it, and cancelling needs no asset', async () => {
  seed();
  await assert.rejects(complete(member, { no_asset_reason: 'n/a' }), /Only the assigned team leader/);
  await resourceService.update('job-orders', leader, 'jo1', { status: 'cancelled' });
  assert.equal(job().status, 'cancelled');
});

test('the asset is removed again if the job order update fails', async () => {
  seed();
  failUpdates = true;
  try {
    await assert.rejects(complete(leader, { completion_asset: { name: 'Gate Valve', type: 'Valve' } }), /db down/);
  } finally {
    failUpdates = false;
  }
  assert.equal(table('assets').length, 0);
});
