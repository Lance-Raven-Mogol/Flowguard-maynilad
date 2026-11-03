import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';

// Isolate the tests from any configured database and SMTP credentials.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_SECRET_KEY = '';
const { authService } = await import('../dist/services/auth.service.js');
const { userRepo } = await import('../dist/models/userRepo.js');
const { mailer } = await import('../dist/services/mailer.service.js');

// Capture emailed codes instead of sending them.
const sent = [];
mailer.sendOtpEmail = async (to, code, purpose) => { sent.push({ to, code, purpose }); };
const lastCode = (to) => [...sent].reverse().find((m) => m.to === to)?.code;
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

function fakeUser(email, extra = {}) {
  return {
    id: `id-${email}`, email, fullName: 'Reset Test', role: 'customer',
    createdAt: new Date().toISOString(), passwordHash: bcrypt.hashSync('old-password', 4),
    otpEnabled: true, ...extra,
  };
}

test('email password recovery', async () => {
  const users = new Map();
  let writes = 0;
  userRepo.findByEmail = async (email) => users.get(email);
  userRepo.findById = async (id) => [...users.values()].find((u) => u.id === id);
  userRepo.update = async (id, patch) => {
    const u = [...users.values()].find((x) => x.id === id);
    writes++; Object.assign(u, patch); return u;
  };

  const user = fakeUser('reset@example.com');
  users.set(user.email, user);

  // Unknown and archived accounts get the same answer and no email.
  const generic = await authService.requestPasswordReset({ email: 'missing@example.com' });
  users.set('archived@example.com', fakeUser('archived@example.com', { isArchived: true }));
  assert.deepEqual(await authService.requestPasswordReset({ email: 'archived@example.com' }), generic);
  assert.equal(sent.length, 0);

  await authService.requestPasswordReset({ email: ' RESET@example.com ' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].purpose, 'reset');
  const code = lastCode(user.email);
  assert.match(code, /^\d{6}$/);

  // Resend within the cooldown is refused.
  await assert.rejects(authService.requestPasswordReset({ email: user.email }), /Please wait/);

  const reset = (overrides = {}) => authService.resetPassword({ email: user.email, otpCode: code, newPassword: 'new-password', ...overrides });
  await assert.rejects(reset({ otpCode: '123' }), /6-digit/);
  await assert.rejects(reset({ newPassword: 'short' }), /at least 6/);
  await assert.rejects(reset({ email: 'missing@example.com' }), /Request a reset code first/);
  await assert.rejects(reset({ otpCode: wrong(code) }), /Invalid code\. 4 attempts remaining/);
  assert.equal(writes, 0);

  await reset({ email: ' RESET@example.com ' });
  assert.equal(writes, 1);
  assert.ok(bcrypt.compareSync('new-password', user.passwordHash));

  // A code works only once.
  await assert.rejects(reset(), /Request a reset code first/);
  assert.equal(writes, 1);
});

test('reset code locks after five wrong attempts', async () => {
  const user = fakeUser('limited@example.com');
  userRepo.findByEmail = async (email) => (email === user.email ? user : undefined);
  userRepo.findById = async (id) => (id === user.id ? user : undefined);
  await authService.requestPasswordReset({ email: user.email });
  const code = lastCode(user.email);
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(authService.resetPassword({ email: user.email, otpCode: wrong(code), newPassword: 'new-password' }), /Invalid code/);
  }
  await assert.rejects(authService.resetPassword({ email: user.email, otpCode: wrong(code), newPassword: 'new-password' }), /Too many failed attempts/);
  await assert.rejects(authService.resetPassword({ email: user.email, otpCode: code, newPassword: 'new-password' }), /Request a reset code first/);
});

test('login with two-factor emails a code', async () => {
  const user = fakeUser('login@example.com');
  userRepo.findByEmail = async (email) => (email === user.email ? user : undefined);
  userRepo.findById = async (id) => (id === user.id ? user : undefined);

  const first = await authService.login({ email: user.email, password: 'old-password' });
  assert.equal(first.otpRequired, true);
  assert.equal(first.token, undefined);
  const code = lastCode(user.email);
  const count = sent.length;

  // Signing in again right away reuses the code already sent.
  await authService.login({ email: user.email, password: 'old-password' });
  assert.equal(sent.length, count);

  await assert.rejects(authService.verifyLoginOtp({ loginToken: first.loginToken, otpCode: wrong(code) }), /Invalid code/);
  const result = await authService.verifyLoginOtp({ loginToken: first.loginToken, otpCode: code });
  assert.ok(result.token);
  assert.equal(result.user.email, user.email);

  user.otpEnabled = false;
  const direct = await authService.login({ email: user.email, password: 'old-password' });
  assert.equal(direct.otpRequired, false);
  assert.ok(direct.token);
});

test('signup creates the account only after the emailed code', async () => {
  let created;
  userRepo.findByEmail = async () => undefined;
  userRepo.create = async (input) => (created = { id: 'new', createdAt: new Date().toISOString(), ...input });

  await assert.rejects(
    authService.initiateRegistration({ fullName: 'New User', email: 'new@example.com', password: 'secret1' }),
    /Terms and Conditions/,
  );
  await assert.rejects(
    authService.initiateRegistration({ fullName: 'New User', email: 'new@example.com', password: 'secret1', acceptTerms: true, isSenior: true }),
    /Senior Citizen ID/,
  );

  const res = await authService.initiateRegistration({
    fullName: 'New User', email: 'new@example.com', password: 'secret1', barangay: 'Tabi, Boac',
    acceptTerms: true, isSenior: true, seniorIdNumber: 'SC-123',
  });
  assert.equal(res.email, 'new@example.com');
  assert.equal(created, undefined);
  const code = lastCode('new@example.com');
  assert.equal(sent.at(-1).purpose, 'signup');

  const done = await authService.completeRegistration({ email: 'new@example.com', otpCode: code });
  assert.ok(done.token);
  assert.equal(created.otpEnabled, true);
  assert.equal(created.barangay, 'Tabi, Boac');
  assert.equal(created.isSenior, true);
  assert.equal(created.seniorIdNumber, 'SC-123');
  assert.ok(created.termsAcceptedAt);
  await assert.rejects(authService.completeRegistration({ email: 'new@example.com', otpCode: code }), /No pending registration/);
});
