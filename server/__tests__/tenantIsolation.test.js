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

// ─── /api/users: super_admin (global) + agency_admin (own agency) ──
test('agency_admin GET /api/users → 200, scoped to own agency', async () => {
  let listParams = null;
  setDbStubs({
    all: async (sql, params) => {
      listParams = params;
      return [{ id: 'u1', email: 'a@a.co', role: 'agency_admin', agencyId: 'agency-A' }];
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);
    // The list must be filtered by the caller's own agencyId.
    assert.deepEqual(listParams, ['agency-A']);
  });
});

test('agency_admin GET /api/users does not leak other agencies (WHERE agencyId = own)', async () => {
  let capturedSql = null;
  setDbStubs({
    all: async (sql, params) => { capturedSql = sql; return []; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 200);
    assert.match(capturedSql, /WHERE "agencyId" = \$1/);
  });
});

test('agency_admin GET /api/users excludes non-admins (role = admin in SQL)', async () => {
  let capturedSql = null;
  setDbStubs({ all: async (sql) => { capturedSql = sql; return []; } });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 200);
    assert.match(capturedSql, /role = 'admin'/);
  });
});

test('agency_admin GET /api/users ignores agencyId in the query string', async () => {
  let listParams = null;
  setDbStubs({ all: async (sql, params) => { listParams = params; return []; } });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users?agencyId=agency-OTHER`);
    assert.equal(res.status, 200);
    assert.deepEqual(listParams, ['agency-A'], 'must scope to the session agency, not the query');
  });
});

// Regression for the reported bug: a legacy 'admin' row that lost its
// agencyId used to be treated as a platform admin and received the GLOBAL
// list (own + super_admin + other agency). It must now expose nothing.
test('legacy admin without agencyId → GET /api/users returns [] (no global leak)', async () => {
  let globalQueried = false;
  setDbStubs({
    all: async (sql) => {
      if (!/WHERE "agencyId"/.test(sql)) globalQueried = true;
      return [{ id: 's', email: 's@x.co', role: 'super_admin', agencyId: null }];
    },
  });
  const app = buildApp('admin', null); // legacy admin, no agency
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, [], 'must not return the global user list');
    assert.equal(globalQueried, false, 'must not run the unscoped global query');
  });
});

test('admin with agencyId (personnel) GET /api/users → 403 Forbidden', async () => {
  setDbStubs();
  const app = buildApp('admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 403);
  });
});

test('agency_admin POST /api/users → 201 and agencyId forced from session', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\)::int AS n FROM "user" WHERE "agencyId"/.test(sql)) return { n: 0 };
      return null; // no existing email
    },
    run: async (sql, params) => { if (/INSERT INTO "user"/.test(sql)) inserted = params; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@y.co', password: 'password123', role: 'admin' }),
    });
    assert.equal(res.status, 201);
    // INSERT params: (id, name, email, emailVerified, image, createdAt, updatedAt, role, banned, trialExpiresAt, agencyId) -> agencyId is index 10
    assert.equal(inserted[10], 'agency-A', 'agencyId must come from the session');
  });
});

test('agency_admin POST /api/users: client-supplied agencyId is ignored', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\)::int AS n FROM "user" WHERE "agencyId"/.test(sql)) return { n: 0 };
      return null;
    },
    run: async (sql, params) => { if (/INSERT INTO "user"/.test(sql)) inserted = params; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@y.co', password: 'password123', role: 'admin', agencyId: 'agency-OTHER' }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserted[10], 'agency-A', 'must never create under the agencyId sent by the client');
  });
});

test('agency_admin POST /api/users role=super_admin → 403', async () => {
  setDbStubs({ get: async () => null });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.co', password: 'password123', role: 'super_admin' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN');
  });
});

test('agency_admin POST /api/users: blocked at 3 accounts with USER_LIMIT_REACHED', async () => {
  let countParams = null;
  setDbStubs({
    get: async (sql, params) => {
      if (/COUNT\(\*\)::int AS n FROM "user" WHERE "agencyId"/.test(sql)) { countParams = params; return { n: 3 }; }
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fourth@y.co', password: 'password123', role: 'admin' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'USER_LIMIT_REACHED');
    assert.equal(body.limit, 3);
    assert.deepEqual(countParams, ['agency-A'], 'limit is counted against own agency');
  });
});

test('agency_admin POST /api/users: allowed when agency has 2 accounts', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\)::int AS n FROM "user" WHERE "agencyId"/.test(sql)) return { n: 2 };
      return null;
    },
    run: async (sql, params) => { if (/INSERT INTO "user"/.test(sql)) inserted = params; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'third@y.co', password: 'password123', role: 'admin' }),
    });
    assert.equal(res.status, 201);
    assert.notEqual(inserted, null);
  });
});

test('agency_admin cannot reset-password of another agency user → 403', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM "user" WHERE id/.test(sql)) return { id: 'u-other', agencyId: 'agency-OTHER', role: 'admin' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/u-other/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN_AGENCY_SCOPE');
  });
});

test('agency_admin cannot delete a user of another agency → 403', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM "user" WHERE id/.test(sql)) return { id: 'u-other', role: 'admin', agencyId: 'agency-OTHER' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/u-other`, { method: 'DELETE' });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN_AGENCY_SCOPE');
  });
});

test('agency_admin can delete a user of own agency → 200', async () => {
  const deletes = [];
  setDbStubs({
    get: async (sql) => {
      if (/FROM "user" WHERE id/.test(sql)) return { id: 'u-own', role: 'admin', agencyId: 'agency-A' };
      return null;
    },
    run: async (sql, params) => { deletes.push(sql); },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/u-own`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(deletes.some(s => /DELETE FROM "user" WHERE id/.test(s)), true);
  });
});

test('staff role still cannot access /api/users → 403', async () => {
  setDbStubs();
  const app = buildApp('staff', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 403);
  });
});

test('super_admin GET /api/users → 200 global (no agency filter)', async () => {
  let capturedSql = null;
  setDbStubs({
    all: async (sql) => { capturedSql = sql; return [{ id: 'u1', email: 'a@a.co', role: 'super_admin', agencyId: null }]; },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users`);
    assert.equal(res.status, 200);
    assert.doesNotMatch(capturedSql, /WHERE "agencyId"/);
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

// ─── super_admin: full access in the context of a chosen agency ────
test('super_admin POST /api/trips with agencyId → 201', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM agencies WHERE id/.test(sql)) return { id: 'agency-B' };
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '0' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', name: 'Voyage', agencyId: 'agency-B' };
      return null;
    },
    run: async (sql, params) => { if (/INSERT INTO trips/.test(sql)) inserted = params; },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Voyage', agencyId: 'agency-B' }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserted[5], 'agency-B', 'trip is created in the chosen agency');
  });
});

test('super_admin POST /api/trips without agencyId → 400 AGENCY_REQUIRED', async () => {
  setDbStubs();
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Voyage' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'AGENCY_REQUIRED');
  });
});

test('super_admin POST /api/trips with unknown agencyId → 400 AGENCY_NOT_FOUND', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM agencies WHERE id/.test(sql)) return null; // agency does not exist
      return null;
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Voyage', agencyId: 'ghost-agency' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'AGENCY_NOT_FOUND');
  });
});

test('super_admin POST /api/travelers in another agency trip → 201', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      if (/FROM travelers WHERE id/.test(sql)) return { id: 'trv-new', displayName: 'X', agencyId: 'agency-OTHER', tripId: 'trip-1' };
      return null;
    },
    all: async (sql) => (/FROM travelers WHERE "agencyId"/.test(sql) ? [] : []),
    run: async (sql, params) => { if (/INSERT INTO travelers/.test(sql)) inserted = params; },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'X', type: 'person', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 201, 'super_admin can add a traveler to any agency trip');
    assert.equal(inserted[9], 'agency-OTHER', 'traveler inherits the trip agency');
  });
});

test('super_admin POST /api/checkin/manual in another agency → 200', async () => {
  let travelerFetches = 0;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      if (/FROM travelers WHERE id/.test(sql)) {
        travelerFetches += 1;
        return {
          id: 'trv-1', referenceCode: 'TRV-1', displayName: 'Alice',
          tripId: 'trip-1', agencyId: 'agency-OTHER',
          status: travelerFetches === 1 ? 'not_checked_in' : 'checked_in',
        };
      }
      return null;
    },
    run: async () => {},
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelerId: 'trv-1', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 200, 'super_admin can check in a traveler from any agency');
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

test('agency_admin POST /api/trips: blocked at 3 trips with TRIP_LIMIT_REACHED', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '3' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fourth Trip' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'TRIP_LIMIT_REACHED');
    assert.equal(body.limit, 3);
  });
});

test('agency_admin POST /api/trips: allowed when agency has 2 trips', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) return { count: '2' };
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-new', agencyId: 'agency-A', name: 'Third' };
      return null;
    },
    run: async (sql, params) => { if (/INSERT INTO trips/.test(sql)) inserted = params; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Third' }),
    });
    assert.equal(res.status, 201);
    assert.notEqual(inserted, null);
  });
});

test('super_admin POST /api/trips: also blocked at 3 trips for the target agency', async () => {
  let countParams = null;
  setDbStubs({
    get: async (sql, params) => {
      if (/FROM agencies WHERE id/.test(sql)) return { id: 'agency-B' };
      if (/COUNT\(\*\) AS count FROM trips/.test(sql)) { countParams = params; return { count: '3' }; }
      return null;
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Big trip', agencyId: 'agency-B' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'TRIP_LIMIT_REACHED');
    assert.deepEqual(countParams, ['agency-B'], 'limit is checked against the target agency');
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

// ─── /api/travelers/:id — detail endpoint scope ────────────────────
test('agency_admin GET /api/travelers/:id own agency → 200 with tripName + agencyName + activity', async () => {
  const traveler = {
    id: 'trv-1', referenceCode: 'TRV-1', displayName: 'Alice',
    type: 'person', peopleCount: 1, phone: null, email: null, notes: '',
    status: 'not_checked_in', checkedInAt: null,
    tripId: 'trip-1', agencyId: 'agency-A',
  };
  let activityParams = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id = \$1$/.test(sql)) return traveler;
      if (/JOIN trips/.test(sql)) return { ...traveler, tripName: 'Voyage A', tripDate: '2026-06-01', agencyName: 'Agence A' };
      return null;
    },
    all: async (sql, params) => {
      if (/FROM scan_events/.test(sql)) {
        activityParams = params;
        return [
          { id: 'e1', action: 'check_in', timestamp: '2026-05-21T08:00:00Z', deviceId: 'scanner-1', tripId: 'trip-1' },
        ];
      }
      return [];
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, 'trv-1');
    assert.equal(body.tripName, 'Voyage A');
    assert.equal(body.agencyName, 'Agence A');
    assert.equal(Array.isArray(body.activity), true);
    assert.equal(body.activity.length, 1);
    assert.equal(body.activity[0].action, 'check_in');
    // Must be filtered by this traveler's referenceCode + tripId
    assert.deepEqual(activityParams, ['TRV-1', 'trip-1']);
  });
});

test('GET /api/travelers/:id with no events → activity: []', async () => {
  const traveler = {
    id: 'trv-2', referenceCode: 'TRV-2', tripId: 'trip-1', agencyId: 'agency-A',
  };
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id = \$1$/.test(sql)) return traveler;
      if (/JOIN trips/.test(sql)) return { ...traveler, tripName: 'X', agencyName: 'Y' };
      return null;
    },
    all: async () => [],
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-2`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.activity, []);
  });
});

test('agency_admin GET /api/travelers/:id activity: cross-agency → 404 (no leak)', async () => {
  let scanEventsHit = false;
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id = \$1$/.test(sql)) {
        return { id: 'trv-X', referenceCode: 'TRV-X', tripId: 'trip-X', agencyId: 'agency-OTHER' };
      }
      return null;
    },
    all: async (sql) => {
      if (/FROM scan_events/.test(sql)) scanEventsHit = true;
      return [];
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-X`);
    assert.equal(res.status, 404);
    assert.equal(scanEventsHit, false, 'scan_events must not be queried for cross-agency travelers');
  });
});

test('agency_admin GET /api/travelers/:id cross-agency → 404', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id = \$1$/.test(sql)) {
        return { id: 'trv-1', referenceCode: 'TRV-1', agencyId: 'agency-OTHER', tripId: 'trip-X' };
      }
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-1`);
    assert.equal(res.status, 404, 'cross-agency traveler must be invisible to agency_admin');
  });
});

test('super_admin GET /api/travelers/:id any agency → 200', async () => {
  const traveler = {
    id: 'trv-2', referenceCode: 'TRV-2', displayName: 'Bob',
    type: 'person', peopleCount: 1, agencyId: 'agency-B', tripId: 'trip-2',
    status: 'checked_in', checkedInAt: '2026-05-21T10:00:00Z',
  };
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id = \$1$/.test(sql)) return traveler;
      if (/JOIN trips/.test(sql)) return { ...traveler, tripName: 'Voyage B', agencyName: 'Agence B' };
      return null;
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-2`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.agencyName, 'Agence B');
  });
});

test('GET /api/travelers/:id not found → 404', async () => {
  setDbStubs({ get: async () => null });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/does-not-exist`);
    assert.equal(res.status, 404);
  });
});

// ─── /api/checkin/manual/bulk + /undo/bulk ─────────────────────────
test('POST /api/checkin/manual/bulk: updates remaining, skips already checked-in', async () => {
  let updatedSql = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      return null;
    },
    all: async (sql) => {
      if (/FROM travelers\s+WHERE id IN/.test(sql)) {
        return [
          { id: 'a', referenceCode: 'A', status: 'not_checked_in', agencyId: 'agency-A', tripId: 'trip-1' },
          { id: 'b', referenceCode: 'B', status: 'not_checked_in', agencyId: 'agency-A', tripId: 'trip-1' },
          { id: 'c', referenceCode: 'C', status: 'checked_in', agencyId: 'agency-A', tripId: 'trip-1' },
        ];
      }
      return [];
    },
    run: async (sql) => { if (/UPDATE travelers/.test(sql)) updatedSql = sql; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/manual/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'trip-1', travelerIds: ['a', 'b', 'c'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, 2);
    assert.equal(body.skipped, 1);
    assert.match(updatedSql, /status = 'checked_in'/);
  });
});

test('POST /api/checkin/undo/bulk: updates checked-in, skips already remaining', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      return null;
    },
    all: async (sql) => {
      if (/FROM travelers\s+WHERE id IN/.test(sql)) {
        return [
          { id: 'a', referenceCode: 'A', status: 'checked_in', agencyId: 'agency-A', tripId: 'trip-1' },
          { id: 'b', referenceCode: 'B', status: 'not_checked_in', agencyId: 'agency-A', tripId: 'trip-1' },
        ];
      }
      return [];
    },
    run: async () => {},
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/undo/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'trip-1', travelerIds: ['a', 'b'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, 1);
    assert.equal(body.skipped, 1);
  });
});

test('agency_admin POST /api/checkin/manual/bulk cross-agency trip → 403', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/manual/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'trip-1', travelerIds: ['a'] }),
    });
    assert.equal(res.status, 403);
  });
});

test('agency_admin POST /api/checkin/manual/bulk: cross-agency travelerIds are silently skipped', async () => {
  let queryParams = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      return null;
    },
    all: async (sql, params) => {
      if (/FROM travelers\s+WHERE id IN/.test(sql)) {
        queryParams = params;
        // Only own-agency rows come back because the SQL filter includes
        // "agencyId" = $N for non-super_admins.
        return [{ id: 'a', referenceCode: 'A', status: 'not_checked_in', agencyId: 'agency-A', tripId: 'trip-1' }];
      }
      return [];
    },
    run: async () => {},
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/manual/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'trip-1', travelerIds: ['a', 'b-other-agency'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, 1);
    assert.equal(body.skipped, 1);
    // The agency filter must be in the SELECT params.
    assert.equal(queryParams.includes('agency-A'), true);
  });
});

// ─── /api/checkin/manual + /undo (used from Dashboard) ─────────────
test('agency_admin POST /api/checkin/manual own agency → 200', async () => {
  let travelerFetches = 0;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE id/.test(sql)) {
        travelerFetches += 1;
        return {
          id: 'trv-1', referenceCode: 'TRV-1', displayName: 'Alice',
          tripId: 'trip-1', agencyId: 'agency-A',
          status: travelerFetches === 1 ? 'not_checked_in' : 'checked_in',
        };
      }
      return null;
    },
    run: async () => {},
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelerId: 'trv-1', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 200);
  });
});

test('agency_admin POST /api/checkin/manual cross-agency trip → 403', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-OTHER' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelerId: 'trv-1', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 403);
  });
});

test('agency_admin POST /api/checkin/undo own agency → 200', async () => {
  let refFetches = 0;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) {
        refFetches += 1;
        return {
          id: 'trv-1', referenceCode: 'TRV-1', displayName: 'Alice',
          tripId: 'trip-1', agencyId: 'agency-A', status: 'checked_in',
        };
      }
      if (/FROM travelers WHERE id/.test(sql)) {
        return {
          id: 'trv-1', referenceCode: 'TRV-1', displayName: 'Alice',
          tripId: 'trip-1', agencyId: 'agency-A', status: 'not_checked_in',
        };
      }
      return null;
    },
    run: async () => {},
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkin/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-1', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 200);
    assert.equal(refFetches >= 1, true);
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

// ─── /api/agencies DELETE — force / guards ─────────────────────────
test('DELETE agency: empty agency → 200', async () => {
  let agencyDeleted = false;
  const txCalls = [];
  setDbStubs({
    get: async (sql, params) => {
      if (/FROM agencies WHERE id/.test(sql)) return { id: 'agency-A', name: 'A' };
      if (/COUNT\(\*\)::int FROM "user"\s*WHERE "agencyId" = \$1\) AS users/.test(sql)) {
        return { users: 0, trips: 0, travelers: 0, scanEvents: 0 };
      }
      if (/COUNT\(\*\)::int AS n FROM "user" WHERE "agencyId" = \$1 AND role = 'super_admin'/.test(sql)) {
        return { n: 0 };
      }
      return null;
    },
    getPool: () => ({
      connect: async () => ({
        query: async (sql) => {
          txCalls.push(sql);
          if (/DELETE FROM agencies/.test(sql)) agencyDeleted = true;
          return { rows: [] };
        },
        release: () => {},
      }),
    }),
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies/agency-A`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(agencyDeleted, true);
    assert.equal(txCalls[0], 'BEGIN');
    assert.equal(txCalls[txCalls.length - 1], 'COMMIT');
  });
});

test('DELETE non-empty agency without force → 409 AGENCY_NOT_EMPTY with counts', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM agencies WHERE id/.test(sql)) return { id: 'agency-A', name: 'A' };
      if (/AS users/.test(sql)) return { users: 1, trips: 3, travelers: 12, scanEvents: 40 };
      return null;
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies/agency-A`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'AGENCY_NOT_EMPTY');
    assert.equal(body.counts.trips, 3);
    assert.equal(body.counts.scanEvents, 40);
  });
});

test('DELETE non-empty agency with force=true → transactional purge', async () => {
  const txCalls = [];
  setDbStubs({
    get: async (sql) => {
      if (/FROM agencies WHERE id/.test(sql)) return { id: 'agency-A', name: 'A' };
      if (/AS users/.test(sql)) return { users: 1, trips: 3, travelers: 12, scanEvents: 40 };
      if (/role = 'super_admin'/.test(sql)) return { n: 0 };
      return null;
    },
    getPool: () => ({
      connect: async () => ({
        query: async (sql) => { txCalls.push(sql); return { rows: [] }; },
        release: () => {},
      }),
    }),
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies/agency-A?force=true`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    const joined = txCalls.join(' | ');
    assert.match(joined, /BEGIN/);
    assert.match(joined, /DELETE FROM "session"/);
    assert.match(joined, /DELETE FROM scan_events/);
    assert.match(joined, /DELETE FROM travelers/);
    assert.match(joined, /DELETE FROM trips/);
    assert.match(joined, /DELETE FROM "user".*'agency_admin'/);
    assert.match(joined, /DELETE FROM agencies/);
    assert.match(joined, /COMMIT/);
  });
});

test('DELETE agency with force=true refuses if super_admin bound to it → 409', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM agencies WHERE id/.test(sql)) return { id: 'agency-A', name: 'A' };
      if (/AS users/.test(sql)) return { users: 2, trips: 0, travelers: 0, scanEvents: 0 };
      if (/role = 'super_admin'/.test(sql)) return { n: 1 };
      return null;
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies/agency-A?force=true`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'SUPER_ADMIN_IN_AGENCY');
  });
});

test('DELETE agency: agency_admin → 403', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/agencies/agency-A`, { method: 'DELETE' });
    assert.equal(res.status, 403);
  });
});

// ─── /api/users DELETE — guards ─────────────────────────────────────
test('DELETE user: super_admin can delete an agency_admin', async () => {
  const deletes = [];
  setDbStubs({
    get: async (sql) => {
      if (/FROM "user" WHERE id/.test(sql)) return { id: 'user-X', role: 'agency_admin', agencyId: 'agency-A' };
      return null;
    },
    run: async (sql, params) => { deletes.push({ sql, params }); },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/user-X`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(deletes.some(d => /DELETE FROM "session"/.test(d.sql)), true);
    assert.equal(deletes.some(d => /DELETE FROM "user" WHERE "agencyId"/.test(d.sql)), true);
  });
});

test('DELETE user: cannot delete the last super_admin', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM "user" WHERE id/.test(sql)) return { id: 'user-X', role: 'super_admin', agencyId: null };
      if (/COUNT\(\*\)::int AS n FROM "user" WHERE role = 'super_admin'/.test(sql)) return { n: 1 };
      return null;
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/user-X`, { method: 'DELETE' });
    assert.equal(res.status, 400);
  });
});

test('DELETE user: cannot delete own account', async () => {
  setDbStubs();
  const app = buildApp('super_admin');
  // The injected req.user has id 'user-1'; deleting 'user-1' is forbidden.
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/user-1`, { method: 'DELETE' });
    assert.equal(res.status, 400);
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
