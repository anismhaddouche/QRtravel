const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, process.env.DB_PATH)
  : path.join(__dirname, 'data', 'checkin.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS travelers (
      id TEXT PRIMARY KEY,
      referenceCode TEXT UNIQUE NOT NULL,
      displayName TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('person', 'couple', 'family', 'group')),
      peopleCount INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'not_checked_in' CHECK(status IN ('not_checked_in', 'checked_in')),
      checkedInAt TEXT,
      notes TEXT DEFAULT '',
      tripId TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (tripId) REFERENCES trips(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      referenceCode TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('check_in', 'undo_check_in')),
      timestamp TEXT NOT NULL,
      deviceId TEXT DEFAULT 'unknown',
      synced INTEGER NOT NULL DEFAULT 1,
      syncStatus TEXT DEFAULT 'synced'
    )
  `);

  // Add columns that may not exist in older databases (safe migration)
  const migrations = [
    "ALTER TABLE travelers ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE travelers ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE scan_events ADD COLUMN syncStatus TEXT DEFAULT 'synced'",
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch (e) { /* column already exists */ }
  }

  try { db.run('CREATE INDEX idx_travelers_reference ON travelers(referenceCode)'); } catch (e) {}
  try { db.run('CREATE INDEX idx_travelers_trip ON travelers(tripId)'); } catch (e) {}
  try { db.run('CREATE INDEX idx_scan_events_reference ON scan_events(referenceCode)'); } catch (e) {}
  try { db.run('CREATE INDEX idx_trips_status ON trips(status)'); } catch (e) {}

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

module.exports = { initDb, run, get, all, saveDb, getDb: () => db };
