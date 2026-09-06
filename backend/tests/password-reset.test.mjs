import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';

// Isolate the tests from any configured database and SMTP credentials.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_SECRET_KEY = '';
const { authService } = await import('../dist/services/auth.service.js');
const { userRepo } = await import('../dist/models/userRepo.js');

test('authenticator password recovery', async () => {
  const secret = speakeasy.generateSecret().base32;
  const user = {
    id: 'reset-test', email: 'reset@example.com', fullName: 'Reset Test', role: 'customer',
    createdAt: new Date().toISOString(), passwordHash: bcrypt.hashSync('old-password', 4),
    otpEnabled: true, otpSecret: secret,
  };
  let writes = 0;
  userRepo.findByEmail = async (email) => email === user.email ? user : undefined;
  userRepo.update = async (_id, patch) => { writes++; Object.assign(user, patch); return user; };
  const code = () => speakeasy.totp({ secret, encoding: 'base32' });
  const reset = (overrides = {}) => authService.resetPassword({ email: user.email, otpCode: code(), newPassword: 'new-password', ...overrides });

  await assert.rejects(reset({ otpCode: '123' }), /6-digit/);
  await assert.rejects(reset({ newPassword: 'short' }), /at least 6/);
  await assert.rejects(reset({ email: 'missing@example.com' }), /Unable to reset/);
  const expired = speakeasy.totp({ secret, encoding: 'base32', time: Math.floor(Date.now() / 1000) - 300 });
  await assert.rejects(reset({ otpCode: expired }), /Unable to reset/);
  assert.equal(writes, 0);

  await reset({ email: ' RESET@example.com ' });
  assert.equal(writes, 1);
  assert.ok(bcrypt.compareSync('new-password', user.passwordHash));
  assert.equal(user.otpSecret, secret);
  assert.equal(user.otpEnabled, true);
  await assert.rejects(reset(), /Unable to reset/);
  assert.equal(writes, 1);

  for (const [suffix, patch] of [
    ['disabled', { otpEnabled: false }],
    ['pending', { otpEnabled: true, otpSecret: `pending:${secret}` }],
    ['missing-secret', { otpSecret: undefined }],
    ['archived', { otpSecret: secret, isArchived: true }],
  ]) {
    user.email = `${suffix}@example.com`;
    Object.assign(user, patch);
    await assert.rejects(reset(), /Unable to reset/);
  }
  assert.equal(writes, 1);

  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(reset({ email: 'limited@example.com' }), /Unable to reset/);
  }
  await assert.rejects(reset({ email: 'limited@example.com' }), /Too many reset attempts/);
  assert.equal(writes, 1);
});
