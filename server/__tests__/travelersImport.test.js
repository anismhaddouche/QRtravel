// Tests for traveler phone/email fields + CSV import.
//
// Same approach as tenantIsolation.test.js — stub db module before
// requiring the route, then exercise via fetch.

const test = require('node:test');
const assert = require('node:assert/strict');

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

function buildApp(role, agencyId) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'user-1', username: 'tester', email: 'tester@example.com', role, agencyId: agencyId || null };
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

// ─── Traveler create/update phone+email ────────────────────────────

test('POST /travelers: create with phone+email persists them', async () => {
  let inserted = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) return null;
      if (/FROM travelers WHERE id/.test(sql)) return { id: 'new', displayName: 'X' };
      return null;
    },
    run: async (sql, params) => { if (/INSERT INTO travelers/.test(sql)) inserted = params; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceCode: 'TRV-1', displayName: 'X', type: 'person', tripId: 'trip-1',
        phone: '0612345678', email: 'X@Example.COM',
      }),
    });
    assert.equal(res.status, 201);
    // phone = position 7, email = position 8 in INSERT params (1-indexed: 7,8)
    assert.equal(inserted[6], '0612345678');
    assert.equal(inserted[7], 'x@example.com');
  });
});

test('POST /travelers: create without phone/email works', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) return null;
      if (/FROM travelers WHERE id/.test(sql)) return { id: 'new' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceCode: 'TRV-2', displayName: 'Y', type: 'person', tripId: 'trip-1',
      }),
    });
    assert.equal(res.status, 201);
  });
});

test('POST /travelers: invalid email → 400 VALIDATION', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceCode: 'TRV-3', displayName: 'Z', type: 'person', tripId: 'trip-1',
        email: 'not-an-email',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
  });
});

test('POST /travelers: phone too long → 400 VALIDATION', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      return null;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceCode: 'TRV-4', displayName: 'W', type: 'person', tripId: 'trip-1',
        phone: '0'.repeat(31),
      }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /travelers: update phone+email', async () => {
  let updateParams = null;
  setDbStubs({
    get: async (sql) => {
      if (/FROM travelers WHERE id/.test(sql)) return { id: 't1', agencyId: 'agency-A', displayName: 'X' };
      return null;
    },
    run: async (sql, params) => { if (/UPDATE travelers/.test(sql)) updateParams = params; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/t1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0777777777', email: 'a@b.co' }),
    });
    assert.equal(res.status, 200);
    // params: [displayName, type, peopleCount, notes, status, now, phoneSet, phone, emailSet, email, id]
    assert.equal(updateParams[6], true);
    assert.equal(updateParams[7], '0777777777');
    assert.equal(updateParams[8], true);
    assert.equal(updateParams[9], 'a@b.co');
  });
});

// ─── CSV import ────────────────────────────────────────────────────

async function postCsv(base, tripId, csv) {
  return fetch(`${base}/api/travelers/import-csv?tripId=${tripId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csv,
  });
}

function stubsForImport({ tripAgencyId = 'agency-A', existingRefs = [], insertSink } = {}) {
  return {
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: tripAgencyId };
      return null;
    },
    all: async (sql) => {
      if (/SELECT "referenceCode" FROM travelers/.test(sql)) return existingRefs.map(r => ({ referenceCode: r }));
      return [];
    },
    run: async (sql, params) => {
      if (/INSERT INTO travelers/.test(sql) && insertSink) insertSink.push(params);
    },
  };
}

test('CSV import: valid comma-separated → all rows created', async () => {
  const inserts = [];
  setDbStubs(stubsForImport({ insertSink: inserts }));
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `type,nom,prenom,tel,mail
Individuel,Dupont,Karim,0555555555,karim@example.com
Individuel,Benali,Sara,0666666666,sara@example.com`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 2);
    assert.equal(body.failed, 0);
    assert.equal(inserts.length, 2);
    // displayName = "Karim Dupont"
    assert.equal(inserts[0][2], 'Karim Dupont');
  });
});

test('CSV import: semicolon separator also works', async () => {
  const inserts = [];
  setDbStubs(stubsForImport({ insertSink: inserts }));
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `type;nom;prenom;tel;mail
Individuel;Dupont;Karim;0555;karim@example.com`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 1);
    assert.equal(inserts[0][2], 'Karim Dupont');
  });
});

test('CSV import: missing nom on a line → per-line error', async () => {
  setDbStubs(stubsForImport());
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `type,nom,prenom,tel,mail
Individuel,,Karim,0555,karim@example.com
Individuel,Dupont,Sara,0666,sara@example.com`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 1);
    assert.equal(body.failed, 1);
    assert.equal(body.errors[0].line, 2);
    assert.match(body.errors[0].error, /Nom/i);
  });
});

test('CSV import: invalid email on a line → per-line error', async () => {
  setDbStubs(stubsForImport());
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `type,nom,prenom,tel,mail
Individuel,Dupont,Karim,0555,nope-not-email
Individuel,Benali,Sara,0666,sara@example.com`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 1);
    assert.equal(body.failed, 1);
    assert.match(body.errors[0].error, /Email/i);
  });
});

test('CSV import: missing required columns → 400 VALIDATION', async () => {
  setDbStubs(stubsForImport());
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `foo,bar
1,2`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
  });
});

test('CSV import: agency_admin cannot import into another agency trip → 404', async () => {
  setDbStubs(stubsForImport({ tripAgencyId: 'agency-OTHER' }));
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `type,nom,prenom,tel,mail
Individuel,Dupont,Karim,,`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 404);
  });
});

test('CSV import: super_admin can import into any selected trip', async () => {
  const inserts = [];
  setDbStubs(stubsForImport({ tripAgencyId: 'agency-OTHER', insertSink: inserts }));
  const app = buildApp('super_admin');
  const csv = `type,nom,prenom,tel,mail
Individuel,Dupont,Karim,,`;
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', csv);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 1);
    // The insert must be scoped to the trip's actual agency, not super_admin's null.
    assert.equal(inserts[0][9], 'agency-OTHER');
  });
});

test('CSV import: missing tripId → 400 VALIDATION', async () => {
  setDbStubs(stubsForImport());
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: 'type,nom,prenom,tel,mail\nIndividuel,X,Y,,',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
  });
});

test('CSV import: too many rows → 413', async () => {
  setDbStubs(stubsForImport());
  const app = buildApp('agency_admin', 'agency-A');
  const header = 'type,nom,prenom,tel,mail';
  const lines = [header];
  for (let i = 0; i < 501; i++) lines.push(`Individuel,N${i},P${i},,`);
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', lines.join('\n'));
    assert.equal(res.status, 413);
  });
});

test('POST /travelers: duplicate referenceCode (pg 23505) → 409 DUPLICATE_REFERENCE', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      // Pre-check returns null so we reach INSERT, which then races to a duplicate.
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) return null;
      return null;
    },
    run: async () => { const e = new Error('duplicate key'); e.code = '23505'; throw e; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-DUP', displayName: 'X', type: 'person', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'DUPLICATE_REFERENCE');
  });
});

test('POST /travelers: missing column (pg 42703) → 500 DB_ERROR with safe message', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      if (/FROM travelers WHERE "referenceCode"/.test(sql)) return null;
      return null;
    },
    run: async () => { const e = new Error('column "phone" does not exist'); e.code = '42703'; throw e; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceCode: 'TRV-X', displayName: 'X', type: 'person', tripId: 'trip-1' }),
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.code, 'DB_ERROR');
    assert.match(body.error, /Erreur base de données/);
  });
});

test('CSV import: missing column on every row → per-line message names it', async () => {
  setDbStubs({
    get: async (sql) => {
      if (/FROM trips WHERE id/.test(sql)) return { id: 'trip-1', agencyId: 'agency-A' };
      return null;
    },
    all: async () => [],
    run: async (sql) => {
      if (/INSERT INTO travelers/.test(sql)) {
        const e = new Error('column "phone" does not exist'); e.code = '42703'; throw e;
      }
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  const csv = `type,nom,prenom,tel,mail\nIndividuel,Dupont,Karim,0555,karim@example.com`;
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/import-csv?tripId=trip-1`, {
      method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 0);
    assert.equal(body.failed, 1);
    assert.match(body.errors[0].error, /Colonne manquante/);
  });
});

test('CSV import: empty body → 400 VALIDATION', async () => {
  setDbStubs(stubsForImport());
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await postCsv(base, 'trip-1', '');
    assert.equal(res.status, 400);
  });
});
