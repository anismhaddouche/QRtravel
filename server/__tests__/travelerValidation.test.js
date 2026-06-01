// Validation of /api/travelers POST/PUT:
// - firstName + lastName required (or legacy displayName)
// - PERSON_NAME_RE (accents, hyphens, apostrophes), 2..50 chars
// - phone format + 8..15 digit count
// - email format + max 120 chars
// - notes max 500 chars + no obvious HTML injection

const test = require('node:test');
const assert = require('node:assert/strict');

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
  app.use('/api/travelers', require('../routes/travelers'));
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

// Default stubs: trip lookup succeeds in agency-A, refCode pool empty.
function happyPathDb() {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE id/.test(sql)) {
        return { id: 'trv-new', agencyId: 'agency-A', tripId: 'trip-1', displayName: 'Test' };
      }
      return null;
    },
    all: async () => [],
    run: async (sql, params) => { if (/INSERT INTO travelers/.test(sql)) inserted = params; },
  });
  return () => inserted;
}

const VALID_POST = {
  firstName: 'Élodie',
  lastName: "O'Connor",
  type: 'person',
  tripId: 'trip-1',
};

// ─── Happy path ────────────────────────────────────────────────────
test('POST /travelers: firstName + lastName accepted, displayName built server-side', async () => {
  const getInserted = happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_POST),
    });
    assert.equal(res.status, 201);
    const inserted = getInserted();
    assert.ok(inserted, 'INSERT was called');
    // params: [id, referenceCode, displayName, type, count, notes, phone, email, tripId, agencyId, ...]
    assert.equal(inserted[2], "Élodie O'Connor");
    // referenceCode is server-generated (starts with TRV-).
    assert.match(inserted[1], /^TRV-/);
  });
});

// ─── Name validation ───────────────────────────────────────────────
test('POST /travelers: missing firstName → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, firstName: '' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
  });
});

test('POST /travelers: missing lastName → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, lastName: '' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /travelers: lastName too short → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, lastName: 'A' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /nom/i);
  });
});

test('POST /travelers: lastName with forbidden chars → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, lastName: '<script>' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /travelers: composed names with accents/hyphens/apostrophes accepted', async () => {
  const getInserted = happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, firstName: 'Aït Ali', lastName: 'Ben-Mohamed' }),
    });
    assert.equal(res.status, 201);
    const inserted = getInserted();
    assert.equal(inserted[2], 'Aït Ali Ben-Mohamed');
  });
});

// ─── Phone validation ──────────────────────────────────────────────
test('POST /travelers: valid French/Algerian phone accepted', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, phone: '+213 555 12 34 56' }),
    });
    assert.equal(res.status, 201);
  });
});

test('POST /travelers: phone with letters → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, phone: 'ABC123' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /téléphone/i);
  });
});

test('POST /travelers: phone with too few digits → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, phone: '12345' }),
    });
    assert.equal(res.status, 400);
  });
});

// ─── Email validation ──────────────────────────────────────────────
test('POST /travelers: valid email accepted', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, email: 'user@example.com' }),
    });
    assert.equal(res.status, 201);
  });
});

test('POST /travelers: invalid email → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, email: 'not-an-email' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /email/i);
  });
});

// ─── Notes validation ──────────────────────────────────────────────
test('POST /travelers: notes over 500 chars → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, notes: 'x'.repeat(501) }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /notes/i);
  });
});

test('POST /travelers: notes with <script → 400', async () => {
  happyPathDb();
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_POST, notes: 'hello <script>alert(1)</script>' }),
    });
    assert.equal(res.status, 400);
  });
});

// ─── PUT validation ────────────────────────────────────────────────
test('PUT /travelers/:id: invalid phone → 400', async () => {
  setDbStubs({
    get: async () => ({ id: 'trv-1', agencyId: 'agency-A', tripId: 'trip-1', type: 'person', peopleCount: 1, displayName: 'X' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: 'ABCDEF' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /travelers/:id: invalid email → 400', async () => {
  setDbStubs({
    get: async () => ({ id: 'trv-1', agencyId: 'agency-A', tripId: 'trip-1', type: 'person', peopleCount: 1, displayName: 'X' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nope' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /travelers/:id: firstName + lastName rebuilds displayName', async () => {
  let updatedParams = null;
  setDbStubs({
    get: async () => ({ id: 'trv-1', agencyId: 'agency-A', tripId: 'trip-1', type: 'person', peopleCount: 1, displayName: 'Old Name' }),
    run: async (sql, params) => { if (/UPDATE travelers/.test(sql)) updatedParams = params; },
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Jean', lastName: 'Dupont' }),
    });
    assert.equal(res.status, 200);
    // First positional param in the UPDATE is displayName.
    assert.equal(updatedParams[0], 'Jean Dupont');
  });
});

test('PUT /travelers/:id: notes over 500 → 400', async () => {
  setDbStubs({
    get: async () => ({ id: 'trv-1', agencyId: 'agency-A', tripId: 'trip-1', type: 'person', peopleCount: 1, displayName: 'X' }),
  });
  const app = buildApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/trv-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'x'.repeat(501) }),
    });
    assert.equal(res.status, 400);
  });
});
