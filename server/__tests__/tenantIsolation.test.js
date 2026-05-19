// Route-level tenant isolation tests.
//
// These tests boot the real Express routers (trips, travelers, checkin,
// qrcodes, users, agencies) with the actual middleware wiring, but
// monkey-patch the db module so no real database is required. Each
// test injects a fake `req.user` to simulate super_admin / agency_admin
// / staff and asserts the HTTP behavior.
//
// Why not supertest? It would add a devDependency. Node's built-in
// http server + fetch are enough.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

// ─── Stub the db module BEFORE any route file is required ──────────
// Routes destructure `{ get, run, all }` at require-time, so we expose
// stable wrapper functions that dispatch to a per-test `_impl` object.
const dbPath = require.resolve('../db');
const _impl = {
  get: async () => null,
  all: async () => [],
  run: async () => {},
  query: async () => ({ rows: [] }),
};
let _poolImpl = {
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
};
const fakeDb = {
  query: (...a) => _impl.query(...a),
  run:   (...a) => _impl.run(...a),
  get:   (...a) => _impl.get(...a),
  all:   (...a) => _impl.all(...a),
  getPool: () => _poolImpl,
  initDb: async () => {},
  checkConnection: async () => true,
  sanitizeDatabaseUrl: (u) => u,
};
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: fakeDb,
};

// ─── Build an Express app that mirrors server/index.js routing ─────
const express = require('express');

function buildApp(role, agencyId) {
  const app = express();
  app.use(express.json());
  // Inject a fake authenticated user.
  app.use((req, res, next) => {
    req.user = role === null
      ? null
      : { id: 'user-1', username: 'tester@example.com', email: 'tester@example.com', role, agencyId: agencyId || null };
    next();
  });
  app.use('/api/agencies',  require('../routes/agencies'));
  app.use('/api/users',     require('../routes/users'));
  app.use('/api/trips',     require('../routes/trips'));
  app.use('/api/travelers', require('../routes/travelers'));
  app.use('/api/qrcodes',   require('../routes/qrcodes'));
  app.use('/api/checkin',   require('../routes/checkin'));
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

function setDbStubs({ get, all, run, getPool } = {}) {
  _impl.get = get || (async () => null);
  _impl.all = all || (async () => []);
  _impl.run = run || (async () => {});
  if (getPool) _poolImpl = getPool();
}

// ─── /api/agencies: super_admin only ───────────────────────────────
test('agency_admin GET /api/agencies → 403', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies`);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN');
  });
});

test('super_admin GET /api/agencies → 200', async () => {
  setDbStubs({ all: async () => [{ id: 'agency-A', name: 'A' }] });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);
  });
});

// ─── /api/users: super_admin only ──────────────────────────────────
test('agency_admin GET /api/users → 403', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 403);
  });
});

test('agency_admin POST /api/users → 403', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.co', password: 'password123', role: 'agency_admin' }),
    });
    assert.equal(res.status, 403);
  });
});

test('super_admin POST /api/users role=staff → 400 VALIDATION', async () => {
  setDbStubs({ get: async () => null });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.co', password: 'password123', role: 'staff' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
  });
});

// ─── /api/trips: agency_admin scope enforced ───────────────────────
test('agency_admin sees only own-agency trips (WHERE agencyId = own)', async () => {
  let capturedWhere = null;
  let capturedParams = null;
  setDbStubs({
    all: async (sql, params) => { capturedWhere = sql; capturedParams = params; return []; },
    get: async () => ({ count: 0 }),
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`);
    assert.equal(res.status, 200);
    assert.match(capturedWhere, /"agencyId" = \$\d+/);
    assert.equal(capturedParams.includes('agency-A'), true);
  });
});

test('agency_admin cannot see another agency trip → 404', async () => {
  setDbStubs({
    get: async () => ({ id: 'trip-1', name: 'X', agencyId: 'agency-OTHER' }),
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips/trip-1`);
    assert.equal(res.status, 404);
  });
});

test('agency_admin POST /api/trips: agencyId is forced from req.user, body value ignored', async () => {
  let inserted = null;
  setDbStubs({
    run: async (sql, params) => { if (/INSERT INTO trips/.test(sql)) inserted = params; },
    get: async () => ({ id: 'trip-new', agencyId: 'agency-A', name: 'My Trip' }),
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Trip', agencyId: 'agency-OTHER' }),
    });
    assert.equal(res.status, 201);
    // INSERT params: (id, name, date, notes, status, agencyId, createdAt, updatedAt)
    assert.equal(inserted[5], 'agency-A', 'agencyId must be forced from req.user, not body');
  });
});

// ─── /api/travelers ────────────────────────────────────────────────
test('agency_admin cannot create traveler under another agency trip', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceCode: 'TRV-X', displayName: 'X', type: 'person', tripId: 'trip-1',
      }),
    });
    assert.equal(res.status, 404, 'cross-agency trip must be invisible to agency_admin');
  });
});

// ─── /api/checkin ──────────────────────────────────────────────────
test('checkin: another-agency trip → 403 FORBIDDEN_AGENCY_SCOPE', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-X', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN_AGENCY_SCOPE');
  });
});

test('checkin: traveler from another agency → 403 FORBIDDEN_AGENCY_SCOPE', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) {
        return { id: 't1', referenceCode: 'TRV-X', tripId: 'trip-other', agencyId: 'agency-OTHER', status: 'not_checked_in', displayName: 'X' };
      }
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-X', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN_AGENCY_SCOPE');
  });
});

test('checkin: wrong trip within same agency → 409 WRONG_TRIP', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) {
        return { id: 't1', referenceCode: 'TRV-X', tripId: 'trip-other-same-agency', agencyId: 'agency-A', status: 'not_checked_in', displayName: 'X' };
      }
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-X', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'WRONG_TRIP');
  });
});

test('checkin: unknown QR → 404 UNKNOWN_CODE', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) return null;
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-NOPE', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'UNKNOWN_CODE');
  });
});

test('checkin: duplicate scan → 409 ALREADY_CHECKED_IN', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) {
        return { id: 't1', referenceCode: 'TRV-X', tripId: 'trip-1', agencyId: 'agency-A', status: 'checked_in', displayName: 'X' };
      }
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-X', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'ALREADY_CHECKED_IN');
  });
});

// ─── /api/qrcodes ──────────────────────────────────────────────────
test('qrcodes: another-agency trip → 403 FORBIDDEN_AGENCY_SCOPE', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/qrcodes?tripId=trip-1`);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN_AGENCY_SCOPE');
  });
});
