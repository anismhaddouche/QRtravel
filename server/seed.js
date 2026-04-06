require('dotenv').config();
const { initDb, run, get } = require('./db');
const { v4: uuidv4 } = require('uuid');

const TRIP_ID = 'trip-demo-001';
const now = new Date().toISOString();

const sampleTravelers = [
  { referenceCode: 'TRV-001', displayName: 'Marco Rossi', type: 'person', peopleCount: 1, notes: '' },
  { referenceCode: 'TRV-002', displayName: 'Sophie & Pierre Dupont', type: 'couple', peopleCount: 2, notes: 'Anniversary trip' },
  { referenceCode: 'TRV-003', displayName: 'The Johnson Family', type: 'family', peopleCount: 4, notes: '2 adults, 2 children' },
  { referenceCode: 'TRV-004', displayName: 'Yuki Tanaka', type: 'person', peopleCount: 1, notes: 'Vegetarian meals' },
  { referenceCode: 'TRV-005', displayName: 'Anna & Klaus Müller', type: 'couple', peopleCount: 2, notes: '' },
  { referenceCode: 'TRV-006', displayName: 'The Garcia Family', type: 'family', peopleCount: 5, notes: '2 adults, 3 children' },
  { referenceCode: 'TRV-007', displayName: 'Elena Petrova', type: 'person', peopleCount: 1, notes: '' },
  { referenceCode: 'TRV-008', displayName: 'David & Sarah Chen', type: 'couple', peopleCount: 2, notes: 'Window seats preferred' },
  { referenceCode: 'TRV-009', displayName: 'The Williams Family', type: 'family', peopleCount: 3, notes: '2 adults, 1 infant' },
  { referenceCode: 'TRV-010', displayName: 'Luca Bianchi', type: 'person', peopleCount: 1, notes: 'Group leader contact' },
];

async function seed() {
  await initDb();

  // Clear existing data
  run('DELETE FROM scan_events');
  run('DELETE FROM travelers');
  run('DELETE FROM trips');

  // Create demo trip
  run(
    'INSERT INTO trips (id, name, date, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [TRIP_ID, 'Barcelona City Tour', '2026-04-10', 'active', now, now]
  );

  // Insert travelers
  for (const t of sampleTravelers) {
    run(
      `INSERT INTO travelers (id, referenceCode, displayName, type, peopleCount, status, checkedInAt, notes, tripId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'not_checked_in', NULL, ?, ?, ?, ?)`,
      [uuidv4(), t.referenceCode, t.displayName, t.type, t.peopleCount, t.notes, TRIP_ID, now, now]
    );
  }

  console.log(`✅ Seeded demo trip "${TRIP_ID}" with ${sampleTravelers.length} traveler units`);
  console.log(`   Total people: ${sampleTravelers.reduce((sum, t) => sum + t.peopleCount, 0)}`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
