// Validation of trip date on POST /api/trips and PUT /api/trips/:id.
// Past dates (strictly before today) must be rejected with 400 VALIDATION.
// Today and future dates are allowed. Missing/non-ISO date strings skip validation.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Stub db before requiring routes.
const dbPath = require.resolve('../db');
const _impl = {
  get: async () => null,
  all: async () => [],
  run: async () => {},
  query: async () => ({ rows: [] }),
};
const fakeDb = {
  query: (...a) => _impl.query(...a),
  run:   (...a) => _impl.run(...a),
  get:   (...a) => _impl.get(...a),
  all:   (...a) => _impl.all(...a),
  getPool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) }),
  initDb: async () => {},
  checkConnection: async () => true,
  sanitizeDatabaseUrl: (u) => u,
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const express = require('express');

function buildApp(role = 'agency_admin', agencyId = 'agency-A') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', username: 'tester', email: 'tester@example.com', role, agencyId };
    next();
  });
  app.use('/api/trips', require('../routes/trips'));
  return app;
}

async function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      try {
        const result = await fn(`http://127.0.0.1:${port}`);
        server.close(() => resolve(result));
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

function setDbStubs({ get, all, run } = {}) {
  _impl.get = get || (async () => null);
  _impl.all = all || (async () => []);
  _impl.run = run || (async () => {});
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDays(iso, delta) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ─── POST /api/trips ───────────────────────────────────────────────
test('POST /api/trips: today date is accepted', async () => {
  let inserted = false;
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '0' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', agencyId: 'agency-A', name: 'OK', date: todayISO() };
      return null;
    },
    run: async (sql) => { if (/INSERT INTO trips/.test(sql)) inserted = true; },
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Today Trip', date: todayISO() }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserted, true);
  });
});

test('POST /api/trips: future date is accepted', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '0' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', agencyId: 'agency-A', name: 'OK' };
      return null;
    },
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Future Trip', date: shiftDays(todayISO(), 30) }),
    });
    assert.equal(res.status, 201);
  });
});

test('POST /api/trips: active + past date is rejected with 400 VALIDATION', async () => {
  setDbStubs({ get: async () => ({ count: '0' }) });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Past Trip', date: shiftDays(todayISO(), -1), status: 'active' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
    assert.match(body.error, /en cours/i);
  });
});

test('POST /api/trips: completed + past date is accepted', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '0' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', agencyId: 'agency-A', name: 'OK' };
      return null;
    },
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Past Completed', date: shiftDays(todayISO(), -10), status: 'completed' }),
    });
    assert.equal(res.status, 201);
  });
});

test('POST /api/trips: archived + past date is accepted', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '0' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', agencyId: 'agency-A', name: 'OK' };
      return null;
    },
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Past Archived', date: shiftDays(todayISO(), -100), status: 'archived' }),
    });
    assert.equal(res.status, 201);
  });
});

test('POST /api/trips: no date is accepted (defaults to today)', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '0' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', agencyId: 'agency-A', name: 'OK' };
      return null;
    },
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No date' }),
    });
    assert.equal(res.status, 201);
  });
});

// ─── PUT /api/trips/:id ────────────────────────────────────────────
test('PUT /api/trips/:id: active + past date is rejected with 400 VALIDATION', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', agencyId: 'agency-A', name: 'Existing', status: 'active' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: shiftDays(todayISO(), -7) }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
    assert.match(body.error, /en cours/i);
  });
});

test('PUT /api/trips/:id: completed + past date is accepted', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', agencyId: 'agency-A', name: 'Existing', status: 'active' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: shiftDays(todayISO(), -5), status: 'completed' }),
    });
    assert.equal(res.status, 200);
  });
});

test('PUT /api/trips/:id: archived + past date is accepted', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', agencyId: 'agency-A', name: 'Existing', status: 'active' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: shiftDays(todayISO(), -30), status: 'archived' }),
    });
    assert.equal(res.status, 200);
  });
});

test('PUT /api/trips/:id: already-completed trip + past date (no status change) is accepted', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', agencyId: 'agency-A', name: 'Existing', status: 'completed' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: shiftDays(todayISO(), -3) }),
    });
    assert.equal(res.status, 200);
  });
});

test('PUT /api/trips/:id: today date is accepted', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', agencyId: 'agency-A', name: 'Existing' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayISO() }),
    });
    assert.equal(res.status, 200);
  });
});

test('PUT /api/trips/:id: omitting date keeps existing past date untouched', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', agencyId: 'agency-A', name: 'Old', date: '2020-01-01' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    assert.equal(res.status, 200);
  });
});

// 3-trips-per-agency cap remains intact.
test('POST /api/trips: still rejects at 3 trips with future date', async () => {
  setDbStubs({
    get: async (sql) => (/COUNT\(\*\) AS count FROM trips/.test(sql) ? { count: '3' } : null),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fourth', date: shiftDays(todayISO(), 10) }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'TRIP_LIMIT_REACHED');
  });
});
