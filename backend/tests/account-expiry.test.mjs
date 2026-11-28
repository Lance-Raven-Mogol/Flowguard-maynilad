// Run with: node --test tests/account-expiry.test.mjs
//
// A customer account that does not become a registered Maynilad customer (no
// CAN) within 2 months of sign-up is deactivated, never deleted, and the
// General Manager can reactivate it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// In-memory store only: no database or SMTP.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_SECRET_KEY = '';
const auth = await import('../dist/services/auth.service.js');
const { userRepo } = await import('../dist/models/userRepo.js');
const { authService, registrationDeadlineFrom, registrationExpired } = auth;

const DAY = 24 * 60 * 60 * 1000;
const past = () => new Date(Date.now() - DAY).toISOString();
let n = 0;
async function signUp() {
  const email = `customer${++n}@example.com`;
  await authService.register({ fullName: `Customer ${n}`, email, password: 'secret123', acceptTerms: true });
  return userRepo.findByEmail(email);
}
const login = (u) => authService.login({ email: u.email, password: 'secret123' });

test('sign-up sets a registration deadline 2 months away', async () => {
  const u = await signUp();
  const deadline = new Date(u.registrationDeadline);
  const expected = new Date(); expected.setMonth(expected.getMonth() + 2);
  assert.ok(Math.abs(deadline.getTime() - expected.getTime()) < 60_000);
  assert.equal(registrationDeadlineFrom(new Date('2026-01-15T00:00:00Z')), '2026-03-15T00:00:00.000Z');
});

test('the emailed-code sign-up sets the deadline too', async () => {
  const { mailer } = await import('../dist/services/mailer.service.js');
  let code = '';
  mailer.sendOtpEmail = async (_to, c) => { code = c; };
  const email = 'otp-signup@example.com';
  await authService.initiateRegistration({ fullName: 'Otp Customer', email, password: 'secret123', acceptTerms: true, barangay: 'Boac' });
  await authService.completeRegistration({ email, otpCode: code });
  const u = await userRepo.findByEmail(email);
  assert.ok(Date.parse(u.registrationDeadline) > Date.now() + 50 * DAY);
});

test('only unregistered customers past the deadline expire', () => {
  const base = { id: 'x', email: 'x@x.com', fullName: 'X', passwordHash: '', createdAt: '', isArchived: false };
  assert.equal(registrationExpired({ ...base, role: 'customer', registrationDeadline: past() }), true);
  assert.equal(registrationExpired({ ...base, role: 'customer', registrationDeadline: new Date(Date.now() + DAY).toISOString() }), false);
  assert.equal(registrationExpired({ ...base, role: 'customer', registrationDeadline: past(), accountNumber: 'CAN-0001' }), false);
  assert.equal(registrationExpired({ ...base, role: 'zone-specialist', registrationDeadline: past() }), false);
  assert.equal(registrationExpired({ ...base, role: 'customer', registrationDeadline: null }), false);
});

test('signing in after the deadline deactivates the account (it is not deleted)', async () => {
  const u = await signUp();
  assert.equal((await login(u)).otpRequired, false);
  await userRepo.update(u.id, { registrationDeadline: past() });
  await assert.rejects(login(u), /registered Maynilad customer within 2 months/);
  const after = await userRepo.findById(u.id);
  assert.ok(after, 'the account still exists');
  assert.equal(after.isArchived, true);
});

test('an existing session loses access once the deadline passes', async () => {
  const u = await signUp();
  await userRepo.update(u.id, { registrationDeadline: past() });
  const checked = await authService.ensureActive(await userRepo.findById(u.id));
  assert.equal(checked.isArchived, true);
});

test('the scheduled check deactivates every overdue customer, and only them', async () => {
  const overdue = await signUp();
  const fresh = await signUp();
  await userRepo.update(overdue.id, { registrationDeadline: past() });
  const count = await authService.deactivateExpiredCustomers();
  assert.ok(count >= 1);
  assert.equal((await userRepo.findById(overdue.id)).isArchived, true);
  assert.equal((await userRepo.findById(fresh.id)).isArchived ?? false, false);
});

test('reactivating gives the customer a fresh 2-month window', async () => {
  const u = await signUp();
  await userRepo.update(u.id, { registrationDeadline: past() });
  await assert.rejects(login(u), /deactivated/);
  await authService.restoreUser(u.id);
  const restored = await userRepo.findById(u.id);
  assert.equal(restored.isArchived, false);
  assert.ok(Date.parse(restored.registrationDeadline) > Date.now() + 50 * DAY);
  assert.equal((await login(u)).otpRequired, false);
});

test('the Commercial Department generates a CAN: a registered customer is not deactivated', async () => {
  const commercial = { id: 'cd', role: 'commercial-department', fullName: 'Cora Commercial', email: 'cd@x.com', createdAt: '' };
  const zone = { id: 'zs', role: 'zone-specialist', fullName: 'Zed Zone', email: 'zs@x.com', createdAt: '' };
  const u = await signUp();
  await assert.rejects(authService.generateCan(u.id, zone), /Only the Commercial Department/);
  const updated = await authService.generateCan(u.id, commercial);
  assert.match(updated.accountNumber, /^[1-9]\d{7}$/);
  await assert.rejects(authService.generateCan(u.id, commercial), /already has CAN/);
  // Past the deadline, but registered: still active.
  await userRepo.update(u.id, { registrationDeadline: past() });
  assert.equal((await login(u)).otpRequired, false);
  await authService.deactivateExpiredCustomers();
  assert.equal((await userRepo.findById(u.id)).isArchived ?? false, false);
  // A deactivated account must be reactivated before it gets a CAN.
  const other = await signUp();
  await userRepo.update(other.id, { registrationDeadline: past() });
  await authService.deactivateExpiredCustomers();
  await assert.rejects(authService.generateCan(other.id, commercial), /deactivated/);
});
