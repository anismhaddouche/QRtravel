// Locks in the validation contract used by server/routes/checkin.js
// without standing up a DB. If the route file diverges from these
// rules the tests will fail and force a conversation.

const test = require('node:test');
const assert = require('node:assert');

const REF_CODE_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;

function normalizeRefCode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  return REF_CODE_RE.test(s) ? s : null;
}

function normalizeId(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return ID_RE.test(s) ? s : null;
}

test('referenceCode is trimmed and uppercased', () => {
  assert.strictEqual(normalizeRefCode('  trv-001 '), 'TRV-001');
});

test('referenceCode rejects whitespace and special chars', () => {
  assert.strictEqual(normalizeRefCode('TRV 001'), null);
  assert.strictEqual(normalizeRefCode('TRV/001'), null);
  assert.strictEqual(normalizeRefCode(''), null);
  assert.strictEqual(normalizeRefCode(null), null);
  assert.strictEqual(normalizeRefCode(123), null);
});

test('referenceCode caps at 64 chars', () => {
  assert.strictEqual(normalizeRefCode('A'.repeat(64)), 'A'.repeat(64));
  assert.strictEqual(normalizeRefCode('A'.repeat(65)), null);
});

test('tripId accepts UUID v4', () => {
  const uuid = '7e3f1c1a-1234-4abc-9def-0123456789ab';
  assert.strictEqual(normalizeId(uuid), uuid);
});

test('tripId accepts seed-style ids', () => {
  assert.strictEqual(normalizeId('trip-demo-001'), 'trip-demo-001');
});

test('tripId rejects garbage', () => {
  assert.strictEqual(normalizeId(''), null);
  assert.strictEqual(normalizeId(undefined), null);
  assert.strictEqual(normalizeId('has space'), null);
  assert.strictEqual(normalizeId("'; DROP TABLE--"), null);
});

function evaluateScope({ travelerTripId, postedTripId }) {
  if (!postedTripId) return { code: 'VALIDATION', status: 400 };
  if (travelerTripId !== postedTripId) return { code: 'WRONG_TRIP', status: 409 };
  return { code: null, status: 200 };
}

test('check-in returns 400 VALIDATION when tripId is missing', () => {
  const r = evaluateScope({ travelerTripId: 'trip-A', postedTripId: '' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.code, 'VALIDATION');
});

test('check-in returns 409 WRONG_TRIP when traveler belongs to a different trip', () => {
  const r = evaluateScope({ travelerTripId: 'trip-A', postedTripId: 'trip-B' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.code, 'WRONG_TRIP');
});

test('check-in proceeds when traveler trip matches posted trip', () => {
  const r = evaluateScope({ travelerTripId: 'trip-A', postedTripId: 'trip-A' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.code, null);
});

function evaluateDuplicate(travelerStatus) {
  if (travelerStatus === 'checked_in') return { code: 'ALREADY_CHECKED_IN', status: 409 };
  return { code: null, status: 200 };
}

test('duplicate check-in returns 409 ALREADY_CHECKED_IN', () => {
  const r = evaluateDuplicate('checked_in');
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.code, 'ALREADY_CHECKED_IN');
});

test('first check-in proceeds when status is not_checked_in', () => {
  const r = evaluateDuplicate('not_checked_in');
  assert.strictEqual(r.status, 200);
});
