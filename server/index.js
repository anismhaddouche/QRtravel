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
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'), false);
  },
  credentials: true,
}));

// Bounded body size — prevents memory-exhaustion DoS via oversized JSON.
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

app.use('/api/auth', require('./routes/auth'));

// ─── Protected routes ───
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

// ─── Lazy DB schema init on first /api request ───
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
