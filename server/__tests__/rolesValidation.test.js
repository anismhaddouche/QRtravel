// Pure-unit tests for the Phase-2 role model. These do not hit a real DB —
// they assert the validation primitives used by routes/users.js and
// lib/scope.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const { isSuperAdmin, isAgencyAdmin, effectiveAgencyId } = require('../lib/scope');

test('super_admin is recognized', () => {
  assert.equal(isSuperAdmin({ role: 'super_admin' }), true);
  assert.equal(isSuperAdmin({ role: 'agency_admin', agencyId: 'a' }), false);
  assert.equal(isSuperAdmin(null), false);
});

test('legacy env-fallback admin (no agency) is treated as super_admin', () => {
  assert.equal(isSuperAdmin({ role: 'admin', agencyId: null }), true);
});

test('legacy admin with agencyId is treated as agency_admin, not super_admin', () => {
  assert.equal(isSuperAdmin({ role: 'admin', agencyId: 'a' }), false);
  assert.equal(isAgencyAdmin({ role: 'admin', agencyId: 'a' }), true);
});

test('agency_admin is recognized', () => {
  assert.equal(isAgencyAdmin({ role: 'agency_admin', agencyId: 'a' }), true);
  assert.equal(isAgencyAdmin({ role: 'super_admin' }), false);
});

test('effectiveAgencyId returns null for super_admin and sentinel for missing scope', () => {
  assert.equal(effectiveAgencyId({ role: 'super_admin' }), null);
  assert.equal(effectiveAgencyId({ role: 'agency_admin', agencyId: 'agency-1' }), 'agency-1');
  assert.equal(effectiveAgencyId({ role: 'agency_admin', agencyId: null }), '__NO_AGENCY__');
});

// Mirror of the role-validation gate in routes/users.js — keeps the
// "staff is rejected" guarantee under test.
const VALID_ROLES = new Set(['super_admin', 'agency_admin']);
function validateCreateRole(input) {
  let role = typeof input === 'string' ? input : 'agency_admin';
  if (role === 'admin') role = 'agency_admin';
  if (role === 'staff') return { ok: false, status: 400, code: 'VALIDATION' };
  if (!VALID_ROLES.has(role)) return { ok: false, status: 400, code: 'VALIDATION' };
  return { ok: true, role };
}

test('staff role is rejected on user creation', () => {
  const r = validateCreateRole('staff');
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.code, 'VALIDATION');
});

test('agency_admin and super_admin are accepted', () => {
  assert.equal(validateCreateRole('agency_admin').ok, true);
  assert.equal(validateCreateRole('super_admin').ok, true);
});

test('legacy "admin" is aliased to agency_admin', () => {
  const r = validateCreateRole('admin');
  assert.equal(r.ok, true);
  assert.equal(r.role, 'agency_admin');
});

// Mirror of POST /api/agencies/with-admin payload validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateWithAdminPayload(body) {
  const agency = body?.agency || {};
  const admin = body?.admin || {};
  if (typeof agency.name !== 'string' || !agency.name.trim()) {
    return { ok: false, field: 'agency.name' };
  }
  if (typeof admin.email !== 'string' || !EMAIL_RE.test(admin.email.trim())) {
    return { ok: false, field: 'admin.email' };
  }
  const pw = typeof admin.password === 'string' ? admin.password : '';
  if (pw.length < 8 || pw.length > 200) {
    return { ok: false, field: 'admin.password' };
  }
  return { ok: true };
}

test('with-admin: rejects empty agency name', () => {
  assert.equal(validateWithAdminPayload({ agency: { name: '' }, admin: { email: 'a@b.co', password: 'password' } }).ok, false);
});

test('with-admin: rejects invalid admin email', () => {
  assert.equal(validateWithAdminPayload({ agency: { name: 'A' }, admin: { email: 'not-an-email', password: 'password' } }).ok, false);
});

test('with-admin: rejects short password', () => {
  assert.equal(validateWithAdminPayload({ agency: { name: 'A' }, admin: { email: 'a@b.co', password: 'short' } }).ok, false);
});

test('with-admin: accepts a complete payload', () => {
  assert.equal(validateWithAdminPayload({ agency: { name: 'Demo' }, admin: { email: 'a@b.co', password: 'password123' } }).ok, true);
});

test('unknown role is rejected', () => {
  assert.equal(validateCreateRole('owner').ok, false);
  assert.equal(validateCreateRole('').ok, false); // empty string is not a valid role
  // Missing body.role (undefined → not string) defaults to agency_admin.
  assert.equal(validateCreateRole(undefined).ok, true);
});
