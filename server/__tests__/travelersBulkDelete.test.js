// Tests for DELETE /api/travelers/bulk and the share helpers.

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

async function bulkDelete(base, ids) {
  return fetch(`${base}/api/travelers/bulk`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ travelerIds: ids }),
  });
}

// ─── Validation ────────────────────────────────────────────────────

test('bulk-delete: travelerIds not array → 400 VALIDATION', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/travelers/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelerIds: 'oops' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'VALIDATION');
  });
});

test('bulk-delete: empty array → 400 VALIDATION', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await bulkDelete(base, []);
    assert.equal(res.status, 400);
  });
});

test('bulk-delete: only invalid ids → 400 VALIDATION', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await bulkDelete(base, ['', '   ', 12345]);
    assert.equal(res.status, 400);
  });
});

test('bulk-delete: > 500 ids → 413 TOO_MANY_IDS', async () => {
  setDbStubs();
  const app = buildApp('agency_admin', 'agency-A');
  const ids = Array.from({ length: 501 }, (_, i) => `t-${i}`);
  await withServer(app, async (base) => {
    const res = await bulkDelete(base, ids);
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.code, 'TOO_MANY_IDS');
  });
});

// ─── Scope ─────────────────────────────────────────────────────────

test('bulk-delete: agency_admin only sees own-agency travelers; others skipped', async () => {
  let scopedSql = null;
  let scopedParams = null;
  const deleted = { scan: null, travelers: null };
  setDbStubs({
    all: async (sql, params) => {
      // The scoped SELECT — it should include AND "agencyId" = $N
      if (/FROM travelers WHERE id IN/.test(sql)) {
        scopedSql = sql; scopedParams = params;
        // Pretend only id1 and id2 belong to agency-A; id3 (other agency) is not returned.
        return [
          { id: 'id1', referenceCode: 'TRV-1', agencyId: 'agency-A' },
          { id: 'id2', referenceCode: 'TRV-2', agencyId: 'agency-A' },
        ];
      }
      return [];
    },
    run: async (sql, params) => {
      if (/DELETE FROM scan_events/.test(sql)) deleted.scan = params;
      if (/DELETE FROM travelers/.test(sql)) deleted.travelers = params;
    },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await bulkDelete(base, ['id1', 'id2', 'id3']);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, 2);
    assert.equal(body.skipped, 1);
    assert.match(scopedSql, /"agencyId" = \$\d+/, 'must include agency scope');
    assert.equal(scopedParams[scopedParams.length - 1], 'agency-A');
    assert.deepEqual(deleted.scan, ['TRV-1', 'TRV-2']);
    assert.deepEqual(deleted.travelers, ['id1', 'id2']);
  });
});

test('bulk-delete: agency_admin with only foreign ids → deleted=0, skipped=N (no DELETE)', async () => {
  let deletes = 0;
  setDbStubs({
    all: async (sql) => {
      if (/FROM travelers WHERE id IN/.test(sql)) return []; // scope filter returns none
      return [];
    },
    run: async (sql) => { if (/DELETE/.test(sql)) deletes++; },
  });
  const app = buildApp('agency_admin', 'agency-A');
  await withServer(app, async (base) => {
    const res = await bulkDelete(base, ['foreign-1', 'foreign-2']);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, 0);
    assert.equal(body.skipped, 2);
    assert.equal(deletes, 0, 'no DELETE should be issued when nothing is in scope');
  });
});

test('bulk-delete: super_admin → SELECT has no agency filter', async () => {
  let scopedSql = null;
  setDbStubs({
    all: async (sql) => {
      if (/FROM travelers WHERE id IN/.test(sql)) {
        scopedSql = sql;
        return [{ id: 'id1', referenceCode: 'TRV-1', agencyId: 'agency-X' }];
      }
      return [];
    },
  });
  const app = buildApp('super_admin');
  await withServer(app, async (base) => {
    const res = await bulkDelete(base, ['id1']);
    assert.equal(res.status, 200);
    assert.doesNotMatch(scopedSql, /"agencyId" = \$/, 'super_admin must not be agency-filtered');
  });
});

// ─── Public PNG QR route ───────────────────────────────────────────

test('GET /qr/:code.png: returns PNG buffer with image/png + cache header', async () => {
  _impl.get = async (sql, params) => {
    if (/FROM travelers WHERE "referenceCode" = \$1/.test(sql) && params[0] === 'TRV-OK') {
      return { referenceCode: 'TRV-OK' };
    }
    return null;
  };
  // Build a minimal app that mounts the public route the same way server/index.js does.
  const app = express();
  const QRCode = require('qrcode');
  const { get: dbGet } = require('../db');
  app.get('/qr/:referenceCode.png', async (req, res) => {
    const raw = String(req.params.referenceCode || '');
    if (!/^[A-Za-z0-9_\-]{1,64}$/.test(raw)) return res.status(400).send('bad');
    const t = await dbGet('SELECT "referenceCode" FROM travelers WHERE "referenceCode" = $1', [raw]);
    if (!t) return res.status(404).send('nf');
    const buf = await QRCode.toBuffer(t.referenceCode, { margin: 2, width: 256 });
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('image/png').send(buf);
  });

  await withServer(app, async (base) => {
    const ok = await fetch(`${base}/qr/TRV-OK.png`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.match(ok.headers.get('cache-control') || '', /public/);
    const buf = Buffer.from(await ok.arrayBuffer());
    // PNG magic header
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);

    const nf = await fetch(`${base}/qr/TRV-MISSING.png`);
    assert.equal(nf.status, 404);

    const bad = await fetch(`${base}/qr/${encodeURIComponent('bad code!')}.png`);
    assert.equal(bad.status, 400);
  });
});

// ─── Share helpers (pure JS, exercised via dynamic import) ─────────

test('share helpers: buildWhatsAppLink returns null without phone', async () => {
  // Use dynamic import — the helper file is ESM-style for the client.
  const mod = await import('../../client/src/utils/share.js');
  const wa = mod.buildWhatsAppLink({ traveler: { displayName: 'X', referenceCode: 'R' }, trip: { name: 'T' }, qrLink: 'http://x/qr/R' });
  assert.equal(wa, null);
});

test('share helpers: buildWhatsAppLink includes referenceCode and tripName', async () => {
  const mod = await import('../../client/src/utils/share.js');
  const wa = mod.buildWhatsAppLink({
    traveler: { displayName: 'Sara', referenceCode: 'TRV-42', phone: '+213 (555) 123-456' },
    trip: { name: 'Voyage Annaba' },
    qrLink: 'https://example.com/qr/TRV-42',
  });
  assert.ok(wa && wa.startsWith('https://wa.me/'));
  // Phone must be digits-only after compaction
  assert.match(wa, /^https:\/\/wa\.me\/213555123456\?text=/);
  const decoded = decodeURIComponent(wa.split('?text=')[1]);
  assert.match(decoded, /TRV-42/);
  assert.match(decoded, /Voyage Annaba/);
  assert.match(decoded, /Sara/);
});

test('share helpers: buildMailtoLink returns null without email', async () => {
  const mod = await import('../../client/src/utils/share.js');
  const link = mod.buildMailtoLink({ traveler: { displayName: 'X', referenceCode: 'R' }, trip: { name: 'T' }, qrLink: 'http://x' });
  assert.equal(link, null);
});

test('share helpers: buildMailtoLink contains subject + body with ref/trip', async () => {
  const mod = await import('../../client/src/utils/share.js');
  const link = mod.buildMailtoLink({
    traveler: { displayName: 'Karim', referenceCode: 'TRV-77', email: 'karim@example.com' },
    trip: { name: 'Voyage Alger' },
    qrLink: 'https://example.com/qr/TRV-77',
    agencyName: 'Acme Travel',
  });
  assert.ok(link && link.startsWith('mailto:'));
  const u = new URL(link);
  // The full mailto contains percent-encoded subject/body
  assert.match(u.search, /subject=/);
  const body = decodeURIComponent(new URLSearchParams(u.search).get('body') || '');
  assert.match(body, /TRV-77/);
  assert.match(body, /Voyage Alger/);
  assert.match(body, /Acme Travel/);
});

test('share helpers: getTravelerQrLink builds /qr/<code>.png on origin', async () => {
  const mod = await import('../../client/src/utils/share.js');
  assert.equal(
    mod.getTravelerQrLink('TRV-1', 'https://app.example.com'),
    'https://app.example.com/qr/TRV-1.png'
  );
  assert.equal(mod.getTravelerQrLink('', 'https://x'), null);
});

test('share helpers: getTravelerQrPageLink builds /qr/<code> (HTML viewer)', async () => {
  const mod = await import('../../client/src/utils/share.js');
  assert.equal(
    mod.getTravelerQrPageLink('TRV-1', 'https://app.example.com'),
    'https://app.example.com/qr/TRV-1'
  );
});
