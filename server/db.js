const { Pool } = require('pg');

// ─── Supabase / Vercel Serverless PostgreSQL Configuration ─────────────────
//
// Key settings for Vercel serverless + Supabase transaction pooler:
//  - max: 1        → Don't keep idle connections across invocations
//  - connectionTimeoutMillis: 10000 → Supabase pooler can take a few seconds
//  - idleTimeoutMillis: 0  → Close connection immediately after use
//  - ssl: required → Supabase always requires SSL

let pool = null;

function getPool() {
  if (pool) return pool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  console.log('[DB] Creating new PostgreSQL connection pool...');

  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    // Serverless-optimized settings
    max: 2,                          // Minimal connections per function instance
    min: 0,                          // Don't maintain idle connections
    idleTimeoutMillis: 5000,         // Release idle connections quickly
    connectionTimeoutMillis: 10000,  // 10s to connect — enough for Supabase cold start
    allowExitOnIdle: true,           // Let the process exit cleanly
  });

  pool.on('connect', () => {
    console.log('[DB] ✅ PostgreSQL connection established');
  });

  pool.on('error', (err) => {
    console.error('[DB] ❌ Unexpected PostgreSQL pool error:', err.message);
    // Reset pool so it's recreated on the next request
    pool = null;
  });

  return pool;
}

// ─── Query helpers with timeout guard ──────────────────────────────────────

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

// ─── Schema initialization ──────────────────────────────────────────────────
// Run once via `npm run seed` or when server starts in local dev.
// On Vercel serverless this is called lazily only once per cold start.

async function initDb() {
  console.log('[DB] Initializing schema...');
  const p = getPool();
  const client = await p.connect();

  try {
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

    // Indexes
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_travelers_reference ON travelers("referenceCode")`,
      `CREATE INDEX IF NOT EXISTS idx_travelers_trip ON travelers("tripId")`,
      `CREATE INDEX IF NOT EXISTS idx_scan_events_reference ON scan_events("referenceCode")`,
      `CREATE INDEX IF NOT EXISTS idx_scan_events_trip ON scan_events("tripId")`,
      `CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions("expiresAt")`,
    ];
    for (const sql of indexes) {
      await client.query(sql);
    }

    // Safe migrations
    const migrations = [
      `ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`,
      `ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS "tripId" TEXT REFERENCES trips(id) ON DELETE CASCADE`,
    ];
    for (const sql of migrations) {
      try { await client.query(sql); } catch { /* column already exists */ }
    }

    console.log('[DB] ✅ Schema initialized successfully');
  } catch (err) {
    console.error('[DB] ❌ Schema initialization failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Health check ──────────────────────────────────────────────────────────

async function checkConnection() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { initDb, query, run, get, all, getPool, checkConnection };
