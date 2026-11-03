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
