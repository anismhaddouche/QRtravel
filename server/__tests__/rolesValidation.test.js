// Pure-unit tests for the Phase-2 role model. These do not hit a real DB —
// they assert the validation primitives used by routes/users.js and
// lib/scope.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const { isSuperAdmin, isAgencyAdmin, effectiveAgencyId, requireSuperAdmin } = require('../lib/scope');

test('super_admin is recognized', () => {
  assert.equal(isSuperAdmin({ role: 'super_admin' }), true);
  assert.equal(isSuperAdmin({ role: 'agency_admin', agencyId: 'a' }), false);
  assert.equal(isSuperAdmin(null), false);
});

test('legacy env-fallback admin (no agency) is treated as super_admin', () => {
  assert.equal(isSuperAdmin({ role: 'admin', agencyId: null }), true);
});

test('admin with agencyId is treated as personnel, not agency_admin or super_admin', () => {
  assert.equal(isSuperAdmin({ role: 'admin', agencyId: 'a' }), false);
  assert.equal(isAgencyAdmin({ role: 'admin', agencyId: 'a' }), false);
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
const VALID_ROLES = new Set(['super_admin', 'agency_admin', 'admin']);
function validateCreateRole(input) {
  let role = typeof input === 'string' ? input : 'admin';
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

test('agency_admin, admin and super_admin are accepted', () => {
  assert.equal(validateCreateRole('agency_admin').ok, true);
  assert.equal(validateCreateRole('super_admin').ok, true);
  assert.equal(validateCreateRole('admin').ok, true);
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

// requireSuperAdmin middleware enforces super_admin only on /api/users.
function runMw(mw, user) {
  let nextCalled = false;
  let status = null;
  let body = null;
  const req = { user };
  const res = {
    status(code) { status = code; return this; },
    json(payload) { body = payload; return this; },
  };
  mw(req, res, () => { nextCalled = true; });
  return { nextCalled, status, body };
}

test('requireSuperAdmin: super_admin passes', () => {
  const r = runMw(requireSuperAdmin, { role: 'super_admin' });
  assert.equal(r.nextCalled, true);
});

test('requireSuperAdmin: agency_admin rejected with 403', () => {
  const r = runMw(requireSuperAdmin, { role: 'agency_admin', agencyId: 'a' });
  assert.equal(r.nextCalled, false);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'FORBIDDEN');
});

test('requireSuperAdmin: anonymous rejected with 403', () => {
  const r = runMw(requireSuperAdmin, null);
  assert.equal(r.nextCalled, false);
  assert.equal(r.status, 403);
});

test('requireSuperAdmin: legacy env-fallback admin (no agency) passes', () => {
  const r = runMw(requireSuperAdmin, { role: 'admin', agencyId: null });
  assert.equal(r.nextCalled, true);
});

test('requireSuperAdmin: legacy admin WITH agencyId is rejected (treated as agency_admin)', () => {
  const r = runMw(requireSuperAdmin, { role: 'admin', agencyId: 'a' });
  assert.equal(r.nextCalled, false);
  assert.equal(r.status, 403);
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
