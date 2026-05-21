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

// ─── /api/travelers/:id — detail endpoint scope ────────────────────
test('agency_admin GET /api/travelers/:id own agency → 200 with tripName + agencyName', async () => {
  const traveler = {
    id: 'trv-1', referenceCode: 'TRV-1', displayName: 'Alice',
    type: 'person', peopleCount: 1, phone: null, email: null, notes: '',
    status: 'not_checked_in', checkedInAt: null,
    tripId: 'trip-1', agencyId: 'agency-A',
  };
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id = \$1$/.test(sql)) return traveler;
      if (/JOIN trips/.test(sql)) return { ...traveler, tripName: 'Voyage A', tripDate: '2026-06-01', agencyName: 'Agence A' };
      return null;
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
      if (/COUNT\(\*\)::int FROM users\s*WHERE "agencyId" = \$1\) AS users/.test(sql)) {
        return { users: 0, trips: 0, travelers: 0, scanEvents: 0 };
      }
      if (/COUNT\(\*\)::int AS n FROM users WHERE "agencyId" = \$1 AND role = 'super_admin'/.test(sql)) {
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
    assert.match(joined, /DELETE FROM sessions/);
    assert.match(joined, /DELETE FROM scan_events/);
    assert.match(joined, /DELETE FROM travelers/);
    assert.match(joined, /DELETE FROM trips/);
    assert.match(joined, /DELETE FROM users.*'agency_admin'/);
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
      if (/FROM users WHERE id/.test(sql)) return { id: 'user-X', role: 'agency_admin', agencyId: 'agency-A' };
      return null;
    },
    run: async (sql, params) => { deletes.push({ sql, params }); },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/users/user-X`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(deletes.some(d => /DELETE FROM sessions/.test(d.sql)), true);
    assert.equal(deletes.some(d => /DELETE FROM users WHERE id/.test(d.sql)), true);
  });
});

test('DELETE user: cannot delete the last super_admin', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM users WHERE id/.test(sql)) return { id: 'user-X', role: 'super_admin', agencyId: null };
      if (/COUNT\(\*\)::int AS n FROM users WHERE role = 'super_admin'/.test(sql)) return { n: 1 };
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
