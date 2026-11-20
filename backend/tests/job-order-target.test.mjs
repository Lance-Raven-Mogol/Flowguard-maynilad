// Run with: node --experimental-test-module-mocks --test tests/job-order-target.test.mjs
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
const commercial = user('commercial-department', 'Cora Commercial');
const tech = user('technical-team', 'Tom Tech');

const manilaDay = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};
const today = manilaDay(0);
const nextWeek = manilaDay(7);

function seed() {
  tables.clear();
  table('incidents').push({ id: 'inc1', ref_code: 'INC-0001', status: 'resolved', required_materials: [] });
}

const create = (extra = {}) =>
  resourceService.create('job-orders', commercial, { title: 'Fix leak', incident_ref: 'INC-0001', ...extra });

const assign = (id, scheduledDate) =>
  resourceService.update('job-orders', tech, id, {
    team: 'in-house',
    team_name: 'Alpha Crew',
    team_leader: 'Lea Leader',
    team_members: ['Lea Leader'],
    assigned_to: 'Lea Leader',
    scheduled_date: scheduledDate,
    schedule_period: 'AM',
    scheduled_start_time: '08:00',
    scheduled_end_time: '12:00',
    status: 'in_progress',
  });

test('a job order cannot be created without a target completion date', async () => {
  seed();
  await assert.rejects(create(), /target completion date/);
  assert.equal(table('job_orders').length, 0);
});

test('the target completion date cannot be in the past', async () => {
  seed();
  await assert.rejects(create({ target_completion_date: '2020-01-01' }), /cannot be in the past/);
  await assert.rejects(create({ target_completion_date: 'next week' }), /valid target completion date/);
});

test('the Commercial Department sets the target date when creating the job order', async () => {
  seed();
  const jo = await create({ target_completion_date: nextWeek });
  assert.equal(jo.target_completion_date, nextWeek);
  assert.equal(jo.status, 'pending');
});

test('the Technical Team cannot schedule the crew after the target date', async () => {
  seed();
  const jo = await create({ target_completion_date: today });
  await assert.rejects(assign(jo.id, nextWeek), /must be finished by/);
  assert.equal(table('job_orders')[0].status, 'pending');
});

test('the Technical Team cannot change the target date', async () => {
  seed();
  const jo = await create({ target_completion_date: nextWeek });
  await assign(jo.id, today);
  const row = table('job_orders')[0];
  assert.equal(row.status, 'in_progress');
  row.status = 'pending'; // allow another assignment attempt
  await resourceService.update('job-orders', tech, jo.id, {
    team: 'in-house', team_name: 'Alpha Crew', team_leader: 'Lea Leader', team_members: ['Lea Leader'],
    scheduled_date: today, schedule_period: 'AM', scheduled_start_time: '08:00', scheduled_end_time: '12:00',
    target_completion_date: '2099-12-31',
  });
  assert.equal(table('job_orders')[0].target_completion_date, nextWeek);
});

test('the Commercial Department can move the target date, but not before the crew schedule', async () => {
  seed();
  const jo = await create({ target_completion_date: manilaDay(10) });
  await assign(jo.id, nextWeek);
  await assert.rejects(
    resourceService.update('job-orders', commercial, jo.id, { target_completion_date: today }),
    /already scheduled/,
  );
  await resourceService.update('job-orders', commercial, jo.id, { target_completion_date: nextWeek });
  assert.equal(table('job_orders')[0].target_completion_date, nextWeek);
});

test('the target date of a completed job order is locked', async () => {
  seed();
  const jo = await create({ target_completion_date: nextWeek });
  table('job_orders')[0].status = 'completed';
  await assert.rejects(
    resourceService.update('job-orders', commercial, jo.id, { target_completion_date: manilaDay(10) }),
    /can no longer be changed/,
  );
});
