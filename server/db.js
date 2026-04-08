const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/qrcheckin',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

async function initDb() {
  const client = await pool.connect();
  try {
    // Create tables
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

    // Create indexes (IF NOT EXISTS is supported in PostgreSQL)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_travelers_reference ON travelers("referenceCode")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_travelers_trip ON travelers("tripId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scan_events_reference ON scan_events("referenceCode")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scan_events_trip ON scan_events("tripId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions("expiresAt")`);

    // Safe migrations for existing databases
    const migrations = [
      `ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`,
      `ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS "tripId" TEXT REFERENCES trips(id) ON DELETE CASCADE`,
    ];
    for (const sql of migrations) {
      try { await client.query(sql); } catch (e) { /* column already exists */ }
    }

    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
}

// Query helpers
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function run(sql, params = []) {
  await pool.query(sql, params);
}

async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

module.exports = { initDb, query, run, get, all, pool };
