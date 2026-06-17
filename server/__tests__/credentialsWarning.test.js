const test = require('node:test');
const assert = require('node:assert');
const { warnIfDefaultCredentials } = require('../lib/credentialsWarning');

function captureWarnings(fn) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(args.join(' '));
  try { fn(); } finally { console.warn = original; }
  return lines.join('\n');
}

test('no warning in non-production', () => {
  const prev = { ...process.env };
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_PASSWORD = 'ADMIN123';
  const output = captureWarnings(() => warnIfDefaultCredentials());
  assert.strictEqual(output, '');
  process.env = prev;
});

test('warns in production when ADMIN_PASSWORD is default', () => {
  const prev = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_USERNAME = 'safe-username';
  process.env.ADMIN_PASSWORD = 'ADMIN123';
  delete process.env.ADMIN_PASSWORD_HASH;
  const output = captureWarnings(() => warnIfDefaultCredentials());
  assert.match(output, /SECURITY WARNING/);
  assert.match(output, /ADMIN_PASSWORD/);
  process.env = prev;
});

test('silent in production when everything is non-default', () => {
  const prev = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_USERNAME = 'voyage-admin';
  process.env.ADMIN_PASSWORD_HASH = '$2a$10$abc';
  const output = captureWarnings(() => warnIfDefaultCredentials());
  assert.strictEqual(output, '');
  process.env = prev;
});
