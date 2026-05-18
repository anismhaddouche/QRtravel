// seed.js is always run locally via `npm run seed`
require('dotenv').config();
const { initDb, get, run, getPool } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const SEED_USERS = [
  { email: 'Bouatittravel@gmail.com', password: 'Qrbouatittravel2026', role: 'admin' },
];

const TRIP_ID_1 = 'trip-demo-001';
const TRIP_ID_2 = 'trip-demo-002';
const now = new Date().toISOString();

const sampleTravelers = [
  { referenceCode: 'TRV-001', displayName: 'Marco Rossi', type: 'person', peopleCount: 1, notes: '', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-002', displayName: 'Sophie & Pierre Dupont', type: 'couple', peopleCount: 2, notes: 'Anniversary trip', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-003', displayName: 'The Johnson Family', type: 'family', peopleCount: 4, notes: '2 adults, 2 children', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-004', displayName: 'Yuki Tanaka', type: 'person', peopleCount: 1, notes: 'Vegetarian meals', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-005', displayName: 'Anna & Klaus Müller', type: 'couple', peopleCount: 2, notes: '', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-006', displayName: 'The Garcia Family', type: 'family', peopleCount: 5, notes: '2 adults, 3 children', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-007', displayName: 'Elena Petrova', type: 'person', peopleCount: 1, notes: '', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-008', displayName: 'David & Sarah Chen', type: 'couple', peopleCount: 2, notes: 'Window seats preferred', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-009', displayName: 'The Williams Family', type: 'family', peopleCount: 3, notes: '2 adults, 1 infant', tripId: TRIP_ID_1 },
  { referenceCode: 'TRV-010', displayName: 'Luca Bianchi', type: 'person', peopleCount: 1, notes: 'Group leader contact', tripId: TRIP_ID_1 },
  // Trip 2 travelers
  { referenceCode: 'TRV-011', displayName: 'James Wilson', type: 'person', peopleCount: 1, notes: '', tripId: TRIP_ID_2 },
  { referenceCode: 'TRV-012', displayName: 'Maria & Antonio Silva', type: 'couple', peopleCount: 2, notes: 'Honeymoon trip', tripId: TRIP_ID_2 },
  { referenceCode: 'TRV-013', displayName: 'The Brown Family', type: 'family', peopleCount: 4, notes: '2 adults, 2 teens', tripId: TRIP_ID_2 },
];

async function seed() {
  await initDb();

  // Clear existing data (order matters for foreign keys)
  await run('DELETE FROM scan_events');
  await run('DELETE FROM travelers');
  await run('DELETE FROM trips');
  await run('DELETE FROM sessions');

  // Create demo trips
  await run(
    `INSERT INTO trips (id, name, date, notes, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [TRIP_ID_1, 'Barcelona City Tour', '2026-04-10', 'Main spring tour with focus on Sagrada Familia and Gothic Quarter', 'active', now, now]
  );

  await run(
    `INSERT INTO trips (id, name, date, notes, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [TRIP_ID_2, 'Paris Weekend Getaway', '2026-04-18', 'Weekend trip — Eiffel Tower, Louvre, Montmartre', 'active', now, now]
  );

  // Insert travelers
  for (const t of sampleTravelers) {
    await run(
      `INSERT INTO travelers (id, "referenceCode", "displayName", type, "peopleCount", status, "checkedInAt", notes, "tripId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'not_checked_in', NULL, $6, $7, $8, $9)`,
      [uuidv4(), t.referenceCode, t.displayName, t.type, t.peopleCount, t.notes, t.tripId, now, now]
    );
  }

  // Seed default users (idempotent — never deletes existing users)
  for (const u of SEED_USERS) {
    const existing = await get(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [u.email]);
    if (existing) {
      console.log(`   👤 User already exists, skipping: ${u.email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    await run(
      `INSERT INTO users (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), u.email, passwordHash, u.role, now, now]
    );
    console.log(`   👤 Created user: ${u.email} (${u.role})`);
  }

  const trip1Count = sampleTravelers.filter(t => t.tripId === TRIP_ID_1);
  const trip2Count = sampleTravelers.filter(t => t.tripId === TRIP_ID_2);

  console.log('');
  console.log('✅ Database seeded successfully!');
  console.log(`   📌 Trip 1: "Barcelona City Tour" — ${trip1Count.length} units, ${trip1Count.reduce((s, t) => s + t.peopleCount, 0)} people`);
  console.log(`   📌 Trip 2: "Paris Weekend Getaway" — ${trip2Count.length} units, ${trip2Count.reduce((s, t) => s + t.peopleCount, 0)} people`);
  console.log('');
  console.log('   🔐 Login with:');
  console.log(`      Username: ${process.env.ADMIN_USERNAME || 'ADMIN'}`);
  console.log(`      Password: ${process.env.ADMIN_PASSWORD || 'ADMIN123'}`);
  console.log('');

  await getPool().end();
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
