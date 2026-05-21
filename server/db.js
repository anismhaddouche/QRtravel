const { Pool } = require('pg');

// ─── Supabase / Vercel Serverless PostgreSQL Configuration ─────────────────
//
// SSL is configured *in code* via { rejectUnauthorized: false } — required
// because Supabase's pooler presents a self-signed cert chain, which pg
// would otherwise reject with "self-signed certificate in certificate chain".
//
// DATABASE_URL is sanitized to strip any sslmode / ssl* query params, because
// pg's connection-string parser will otherwise interpret them and fight our
// explicit ssl config, re-introducing the cert error.
//
// Recommended Vercel DATABASE_URL (NO ?sslmode=require):
//   postgresql://postgres.[REF]:[PWD]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
//
// Port 5432 = Session Pooler (recommended). Port 6543 = Transaction Pooler (fallback).

function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const u = new URL(rawUrl);
    const sslParams = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert'];
    for (const p of sslParams) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return rawUrl
      .replace(/([?&])(sslmode|ssl|sslcert|sslkey|sslrootcert)=[^&]*/gi, '$1')
      .replace(/[?&]$/, '');
  }
}

function logDbEnvOnce(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    console.log(`[DB ENV] user=${parsed.username}`);
    console.log(`[DB ENV] host=${parsed.hostname}`);
    console.log(`[DB ENV] port=${parsed.port}`);
    console.log(`[DB ENV] database=${parsed.pathname.replace('/', '')}`);
    console.log(`[DB ENV] passwordLength=${parsed.password ? parsed.password.length : 0}`);
    console.log(`[DB ENV] ssl=rejectUnauthorized:false (configured in code)`);
  } catch (e) {
    console.warn('[DB ENV] Could not parse DATABASE_URL:', e.message);
  }
}

const rawDbUrl = process.env.DATABASE_URL;
if (!rawDbUrl) {
  console.error('[DB] FATAL: DATABASE_URL environment variable is not set!');
}

let pool = null;

function getPool() {
  if (pool) return pool;

  if (!rawDbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const sanitizedDatabaseUrl = sanitizeDatabaseUrl(rawDbUrl);

  logDbEnvOnce(sanitizedDatabaseUrl);
  console.log('[DB] Creating new PostgreSQL connection pool...');

  pool = new Pool({
    connectionString: sanitizedDatabaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 20000,
    allowExitOnIdle: true,
  });

  pool.on('connect', () => {
    console.log('[DB] PostgreSQL connection established');
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected PostgreSQL pool error:', err.message);
    pool = null;
  });

  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  try {
    const result = await p.query(sql, params);
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '| SQL:', sql.substring(0, 80));
    throw err;
  }
}

async function run(sql, params = []) {
  await query(sql, params);
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function initDb() {
  console.log('[DB] Initializing schema...');
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT,
        notes TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS travelers (
        id TEXT PRIMARY KEY,
        "referenceCode" TEXT UNIQUE NOT NULL,
        "displayName" TEXT NOT NULL,
        type TEXT NOT NULL,
        "peopleCount" INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'not_checked_in',
        "checkedInAt" TEXT,
        notes TEXT DEFAULT '',
        "tripId" TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        "createdAt" TEXT NOT NULL DEFAULT '',
        "updatedAt" TEXT NOT NULL DEFAULT ''
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_events (
        id TEXT PRIMARY KEY,
        "referenceCode" TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        "deviceId" TEXT DEFAULT 'unknown',
        synced INTEGER NOT NULL DEFAULT 1,
        "syncStatus" TEXT DEFAULT 'synced',
        "tripId" TEXT REFERENCES trips(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "expiresAt" TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        "passwordHash" TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      )
    `);

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_travelers_reference ON travelers("referenceCode")`,
      `CREATE INDEX IF NOT EXISTS idx_travelers_trip ON travelers("tripId")`,
      `CREATE INDEX IF NOT EXISTS idx_scan_events_reference ON scan_events("referenceCode")`,
      `CREATE INDEX IF NOT EXISTS idx_scan_events_trip ON scan_events("tripId")`,
      `CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions("expiresAt")`,
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email))`,
    ];
    for (const sql of indexes) {
      await client.query(sql);
    }

    const migrations = [
      `ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`,
      `ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS "tripId" TEXT REFERENCES trips(id) ON DELETE CASCADE`,
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "userId" TEXT`,
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS role TEXT`,
      // Multi-tenant: agencyId on every scoped table + on sessions
      `ALTER TABLE users      ADD COLUMN IF NOT EXISTS "agencyId" TEXT REFERENCES agencies(id) ON DELETE SET NULL`,
      `ALTER TABLE trips      ADD COLUMN IF NOT EXISTS "agencyId" TEXT REFERENCES agencies(id) ON DELETE CASCADE`,
      `ALTER TABLE travelers  ADD COLUMN IF NOT EXISTS "agencyId" TEXT REFERENCES agencies(id) ON DELETE CASCADE`,
      `ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS "agencyId" TEXT REFERENCES agencies(id) ON DELETE CASCADE`,
      `ALTER TABLE sessions   ADD COLUMN IF NOT EXISTS "agencyId" TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_trips_agency      ON trips("agencyId")`,
      `CREATE INDEX IF NOT EXISTS idx_travelers_agency  ON travelers("agencyId")`,
      `CREATE INDEX IF NOT EXISTS idx_scan_events_agency ON scan_events("agencyId")`,
      `CREATE INDEX IF NOT EXISTS idx_users_agency      ON users("agencyId")`,
      // Contact fields on travelers (optional)
      `ALTER TABLE travelers   ADD COLUMN IF NOT EXISTS phone TEXT`,
      `ALTER TABLE travelers   ADD COLUMN IF NOT EXISTS email TEXT`,
      // Collapse legacy types: 'couple' and 'family' are no longer
      // accepted by the API. Existing rows are migrated to 'group' so
      // the UI/labels stay consistent. Idempotent.
      `UPDATE travelers SET type = 'group' WHERE type IN ('couple', 'family')`,
      // Business rule: a Groupe is at least 2 people. Correct any
      // legacy group row with a sub-2 count. Idempotent.
      `UPDATE travelers SET "peopleCount" = 2 WHERE type = 'group' AND "peopleCount" < 2`,
      // Optional per-member details for Groupe travelers. NULL for
      // Individuel and for older groups created before this column.
      `ALTER TABLE travelers ADD COLUMN IF NOT EXISTS "groupMembers" JSONB`,
    ];
    for (const sql of migrations) {
      try {
        await client.query(sql);
      } catch (e) {
        // 42701 = duplicate_column (expected when re-running ADD COLUMN
        // without IF NOT EXISTS). 42P07 = duplicate_table. 42710 =
        // duplicate_object. Everything else means a real migration
        // failure — surface it instead of swallowing.
        const benign = e && (e.code === '42701' || e.code === '42P07' || e.code === '42710');
        if (!benign) {
          console.error('[DB] Migration failed:', sql, '|', e.code, e.message);
          throw e;
        }
      }
    }

    // Sanity-check the critical columns added by recent migrations. If
    // anything is missing in this environment, log it loudly so the
    // operator notices before the first 500 hits production.
    try {
      const check = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'travelers' AND column_name = 'groupMembers'`
      );
      if (check.rows.length === 0) {
        console.error('[DB MIGRATION] travelers."groupMembers" column MISSING after migration step');
      } else {
        console.log('[DB MIGRATION] travelers.groupMembers ensured');
      }
    } catch (e) {
      console.error('[DB MIGRATION] sanity check failed:', e.code, e.message);
    }

    console.log('[DB] Schema initialized successfully');
  } catch (err) {
    console.error('[DB] Schema initialization failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function checkConnection() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  initDb,
  query,
  run,
  get,
  all,
  getPool,
  checkConnection,
  sanitizeDatabaseUrl,
};
