// Only load .env in non-production. On Vercel the platform injects env
// vars; dotenv would otherwise overwrite them at boot.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDb, checkConnection, query, sanitizeDatabaseUrl } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimit');
const { warnIfDefaultCredentials } = require('./lib/credentialsWarning');

warnIfDefaultCredentials();

const app = express();

// Vercel / proxies — required for req.ip and cookie 'secure' to honor
// the X-Forwarded-* headers.
app.set('trust proxy', 1);

// ─── CORS ──────────────────────────────────────────────────────────
// Same-origin requests (no Origin header) are always allowed. Cross-
// origin requests must match ALLOWED_ORIGIN (comma-separated list).
// In dev we additionally allow localhost. `origin: true` is forbidden
// because we send credentials.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, '')) // Remove trailing slash
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
    }
    const cleanOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(cleanOrigin)) return cb(null, true);
    // Allow vercel preview URLs dynamically if you want, but sticking to ALLOWED_ORIGIN is safer.
    return cb(new Error('CORS: origin not allowed'), false);
  },
  credentials: true,
}));

// Bounded body size — prevents memory-exhaustion DoS via oversized JSON.
// Better Auth handler DOIT être avant express.json() car il gère son propre body parsing
const { getAuth } = require('./auth');
app.all('/api/auth/*', async (req, res, next) => {
  try {
    const { toNodeHandler } = await import('better-auth/node');
    const auth = await getAuth();
    return toNodeHandler(auth)(req, res);
  } catch (err) {
    next(err);
  }
});

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Global write-path rate limiter. Read paths excluded so dashboard
// polling is unaffected.
const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'write',
  message: 'Too many requests, please slow down.',
});
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return writeLimiter(req, res, next);
});

// ─── Public routes ───
app.get('/api/health', async (req, res) => {
  const dbOk = await checkConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'error',
  });
});

// ─── Diagnostic endpoints ───
// Disabled entirely in production unless ENABLE_DEBUG_ENDPOINTS=true.
// When enabled in production, also require an authenticated admin session.
const debugEnabled = process.env.NODE_ENV !== 'production'
  || process.env.ENABLE_DEBUG_ENDPOINTS === 'true';

const debugGuard = (req, res, next) => {
  if (!debugEnabled) return res.status(404).json({ error: 'Not found' });
  if (process.env.NODE_ENV !== 'production') return next();
  return requireAuth(req, res, next);
};

app.get('/api/debug/db-env', debugGuard, (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.json({
      nodeEnv: process.env.NODE_ENV || 'undefined',
      hasDatabaseUrl: false,
      dbUser: null,
      dbHost: null,
      dbName: null,
      dbPort: null,
      passwordLength: 0,
      sslRejectUnauthorized: false,
    });
  }
  try {
    const sanitized = sanitizeDatabaseUrl(dbUrl);
    const parsed = new URL(sanitized);
    return res.json({
      nodeEnv: process.env.NODE_ENV || 'undefined',
      hasDatabaseUrl: true,
      dbUser: parsed.username,
      dbHost: parsed.hostname,
      dbName: parsed.pathname.replace('/', ''),
      dbPort: parsed.port,
      passwordLength: parsed.password ? parsed.password.length : 0,
      sslRejectUnauthorized: false,
    });
  } catch (e) {
    return res.json({
      nodeEnv: process.env.NODE_ENV || 'undefined',
      hasDatabaseUrl: true,
      parseError: e.message,
      sslRejectUnauthorized: false,
    });
  }
});

app.get('/api/debug/db-test', debugGuard, async (req, res) => {
  let host = null, port = null, user = null;
  try {
    if (process.env.DATABASE_URL) {
      const parsed = new URL(sanitizeDatabaseUrl(process.env.DATABASE_URL));
      host = parsed.hostname;
      port = parsed.port;
      user = parsed.username;
    }
  } catch { /* ignore */ }

  try {
    const result = await query('SELECT NOW() as now');
    return res.json({ ok: true, now: result.rows[0]?.now, host, port, user });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      code: err.code || 'DB_TEST_FAILED',
      host,
      port,
      user,
    });
  }
});

// ─── Lazy DB schema init on first /api request ───
// Must be registered BEFORE any /api route mount, otherwise routes
// match first and the schema/migrations never run on a cold serverless
// instance — causing 500s on /api/auth/login when the users/sessions
// columns are missing.
let dbInitialized = false;
let dbInitPromise = null;
app.use('/api', async (req, res, next) => {
  if (dbInitialized) return next();
  if (!dbInitPromise) {
    dbInitPromise = initDb()
      .then(() => { dbInitialized = true; })
      .catch((err) => {
        console.error('[SERVER] Database initialization failed:', err.message);
        dbInitPromise = null;
        throw err;
      });
  }
  try {
    await dbInitPromise;
    next();
  } catch (err) {
    res.status(500).json({
      error: 'Database is starting up or temporarily unavailable',
      details: err.message,
    });
  }
});

// (Ancienne route /api/auth retirée en faveur de Better Auth)

// ─── Protected routes ───
app.use('/api/agencies',  requireAuth, require('./routes/agencies'));
app.use('/api/trips',     requireAuth, require('./routes/trips'));
app.use('/api/checkin',   requireAuth, require('./routes/checkin'));
app.use('/api/qrcodes',   requireAuth, require('./routes/qrcodes'));
app.use('/api/travelers', requireAuth, require('./routes/travelers'));
app.use('/api/users',     requireAuth, require('./routes/users'));

// JSON error handler — never leak HTML 500s from /api.
app.use('/api', (err, req, res, next) => {
  console.error('[API] Unhandled error:', err.message);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS: origin not allowed' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Public QR share page ──────────────────────────────────────────
// Renders a minimal HTML page showing a traveler's QR code + non-
// sensitive info (display name, trip name, reference code). No auth,
// no PII beyond what the agency would print on a ticket. The QR
// payload itself is the bare referenceCode — same as in the rest of
// the app. Mounted BEFORE the SPA catch-all so it isn't shadowed.
const QRCode = require('qrcode');
const { get: dbGet } = require('./db');
const REF_CODE_PUBLIC_RE = /^[A-Za-z0-9_\-]{1,64}$/;

// Direct PNG image of the QR — served under /api/ so Vercel's static
// filesystem handler doesn't shadow it with index.html (the SPA
// catch-all in vercel.json sends every non-/api/* path to index.html).
// Used as `qrLink` in WhatsApp/email so recipients see an image
// preview. Payload of the QR is the bare referenceCode.
app.get('/api/qr-image/:referenceCode.png', async (req, res) => {
  try {
    const raw = String(req.params.referenceCode || '');
    if (!REF_CODE_PUBLIC_RE.test(raw)) {
      return res.status(400).json({ error: 'Invalid reference code', code: 'VALIDATION' });
    }
    const t = await dbGet('SELECT "referenceCode" FROM travelers WHERE "referenceCode" = $1', [raw]);
    if (!t) return res.status(404).json({ error: 'QR code not found' });

    const buffer = await QRCode.toBuffer(t.referenceCode, { margin: 2, width: 512 });
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', 'image/png');
    res.end(buffer);
  } catch (err) {
    console.error('[qr-image] error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Legacy local-dev only — on Vercel this path is shadowed by the
// static catch-all in vercel.json. Kept for local Express development
// and as a fallback HTML viewer; not used in share links any more.
app.get('/qr/:referenceCode.png', async (req, res) => {
  try {
    const raw = String(req.params.referenceCode || '');
    if (!REF_CODE_PUBLIC_RE.test(raw)) {
      return res.status(400).type('text/plain').send('Invalid reference code');
    }
    const t = await dbGet('SELECT "referenceCode" FROM travelers WHERE "referenceCode" = $1', [raw]);
    if (!t) return res.status(404).type('text/plain').send('QR code not found');

    const buffer = await QRCode.toBuffer(t.referenceCode, { margin: 2, width: 512 });
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('image/png').send(buffer);
  } catch (err) {
    console.error('[qr-share png] error', err.message);
    res.status(500).type('text/plain').send('Server error');
  }
});

app.get('/qr/:referenceCode', async (req, res) => {
  try {
    const raw = String(req.params.referenceCode || '');
    if (!/^[A-Za-z0-9_\-]{1,64}$/.test(raw)) {
      return res.status(400).type('text/html').send('<!doctype html><meta charset="utf-8"><title>QR</title><p>Code invalide.</p>');
    }
    const t = await dbGet(
      `SELECT t."displayName", t."referenceCode", tr.name AS "tripName"
         FROM travelers t LEFT JOIN trips tr ON tr.id = t."tripId"
        WHERE t."referenceCode" = $1`,
      [raw]
    );
    if (!t) {
      return res.status(404).type('text/html').send('<!doctype html><meta charset="utf-8"><title>QR</title><p>QR code introuvable.</p>');
    }
    const dataUrl = await QRCode.toDataURL(t.referenceCode, { margin: 2, width: 320 });
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
    res.type('text/html').send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>QR — ${esc(t.referenceCode)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0b1020; color:#e6edff; margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { background:#141a32; border:1px solid #2a3358; border-radius:16px; padding:28px; max-width:380px; width:100%; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.4); }
  h1 { font-size:1.1rem; margin:0 0 4px; color:#a9b6e8; font-weight:500; }
  h2 { font-size:1.4rem; margin:0 0 18px; }
  img { width:100%; max-width:280px; height:auto; background:#fff; padding:12px; border-radius:12px; }
  .ref { font-family: ui-monospace, "SF Mono", monospace; font-size:1rem; background:#0b1020; border:1px solid #2a3358; padding:8px 12px; border-radius:8px; display:inline-block; margin-top:14px; }
  p.hint { color:#a9b6e8; font-size:0.85rem; margin-top:14px; }
</style></head><body>
<div class="card">
  <h1>${esc(t.tripName || 'Voyage')}</h1>
  <h2>${esc(t.displayName)}</h2>
  <img src="${dataUrl}" alt="QR code">
  <div class="ref">${esc(t.referenceCode)}</div>
  <p class="hint">Présentez ce QR code au moment de l'embarquement.</p>
</div>
</body></html>`);
  } catch (err) {
    console.error('[qr-share] error', err.message);
    res.status(500).type('text/html').send('<!doctype html><meta charset="utf-8"><title>QR</title><p>Erreur serveur.</p>');
  }
});

// ─── Serve built React frontend (local dev / traditional hosting) ───
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

// ─── Local dev: start HTTP server ───
if (process.env.NODE_ENV !== 'production' || process.env.LOCAL_SERVER === 'true') {
  const PORT = process.env.PORT || 3000;

  initDb()
    .then(() => {
      dbInitialized = true;
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\nQR Check-In running at http://localhost:${PORT}`);
        console.log(`Login: ${process.env.ADMIN_USERNAME || 'ADMIN'} / ${process.env.ADMIN_PASSWORD || 'ADMIN123'}`);
        console.log(`Database: PostgreSQL\n`);
      });
    })
    .catch(err => {
      console.error('Failed to initialize database on startup:', err);
      process.exit(1);
    });
}

module.exports = app;
