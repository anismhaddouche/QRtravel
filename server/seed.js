// Idempotent seed: ensures the platform super_admin, the Bouatit Travel
// agency, the Bouatit agency_admin, and backfills any pre-existing rows
// that are missing an agencyId. Never deletes existing trips/travelers
// and never overwrites existing user passwords.
require('dotenv').config();
const { initDb, get, run, all, getPool } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const SUPER_ADMIN = {
  email: 'ytiachacht@gmail.com',
  password: 'Younes2005',
  role: 'super_admin',
};

const BOUATIT_AGENCY_NAME = 'Bouatit Travel';
const BOUATIT_ADMIN = {
  email: 'Bouatittravel@gmail.com',
  password: 'Qrbouatittravel2026',
  role: 'agency_admin',
};

async function ensureAgency(name, { email = null, phone = null } = {}) {
  const existing = await get(`SELECT * FROM agencies WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  if (existing) {
    console.log(`   🏢 Agency exists: ${existing.name} (${existing.id})`);
    return existing;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO agencies (id, name, email, phone, status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'active', $5, $5)`,
    [id, name, email, phone, now]
  );
  console.log(`   🏢 Created agency: ${name} (${id})`);
  return await get(`SELECT * FROM agencies WHERE id = $1`, [id]);
}

async function ensureUser({ email, password, role, agencyId = null }) {
  const existing = await get(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  const now = new Date().toISOString();

  if (existing) {
    // Update role + agencyId for existing user, NEVER overwrite password.
    const changes = [];
    const params = [];
    if (existing.role !== role) {
      params.push(role); changes.push(`role = $${params.length}`);
    }
    if ((existing.agencyId || null) !== (agencyId || null)) {
      params.push(agencyId); changes.push(`"agencyId" = $${params.length}`);
    }
    if (changes.length === 0) {
      console.log(`   👤 User already correct: ${email} (${role})`);
      return existing;
    }
    params.push(now); changes.push(`"updatedAt" = $${params.length}`);
    params.push(existing.id);
    await run(`UPDATE users SET ${changes.join(', ')} WHERE id = $${params.length}`, params);
    console.log(`   👤 Updated user: ${email} → role=${role}, agencyId=${agencyId || 'NULL'} (password preserved)`);
    return await get(`SELECT * FROM users WHERE id = $1`, [existing.id]);
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  await run(
    `INSERT INTO users (id, email, "passwordHash", role, "agencyId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [id, email, passwordHash, role, agencyId, now]
  );
  console.log(`   👤 Created user: ${email} (${role})${agencyId ? `, agencyId=${agencyId}` : ''}`);
  return await get(`SELECT * FROM users WHERE id = $1`, [id]);
}

async function backfillExistingData(defaultAgencyId) {
  // Trips without agency → default agency
  const orphanTrips = await all(`SELECT id FROM trips WHERE "agencyId" IS NULL`);
  if (orphanTrips.length) {
    await run(`UPDATE trips SET "agencyId" = $1 WHERE "agencyId" IS NULL`, [defaultAgencyId]);
    console.log(`   🔄 Backfilled ${orphanTrips.length} trip(s) → agency`);
  }

  // Travelers → inherit from their trip
  const orphanTravelers = await get(`SELECT COUNT(*)::int AS n FROM travelers WHERE "agencyId" IS NULL`);
  if (orphanTravelers && orphanTravelers.n > 0) {
    await run(
      `UPDATE travelers t SET "agencyId" = tr."agencyId"
       FROM trips tr WHERE t."tripId" = tr.id AND t."agencyId" IS NULL`
    );
    console.log(`   🔄 Backfilled ${orphanTravelers.n} traveler(s) from their trips`);
  }

  // Scan events → inherit from their trip
  const orphanEvents = await get(`SELECT COUNT(*)::int AS n FROM scan_events WHERE "agencyId" IS NULL`);
  if (orphanEvents && orphanEvents.n > 0) {
    await run(
      `UPDATE scan_events s SET "agencyId" = tr."agencyId"
       FROM trips tr WHERE s."tripId" = tr.id AND s."agencyId" IS NULL`
    );
    console.log(`   🔄 Backfilled ${orphanEvents.n} scan event(s) from their trips`);
  }

  // Legacy 'admin' DB users without agencyId → bind to default agency as agency_admin
  // (Skip the canonical super_admin email so we don't accidentally demote it.)
  const legacyAdmins = await all(
    `SELECT id, email FROM users WHERE role = 'admin' AND "agencyId" IS NULL AND LOWER(email) <> LOWER($1)`,
    [SUPER_ADMIN.email]
  );
  for (const u of legacyAdmins) {
    await run(
      `UPDATE users SET role = 'agency_admin', "agencyId" = $1, "updatedAt" = $2 WHERE id = $3`,
      [defaultAgencyId, new Date().toISOString(), u.id]
    );
    console.log(`   🔄 Migrated legacy admin → agency_admin: ${u.email}`);
  }

  // Legacy 'staff' users without agencyId → default agency
  const legacyStaff = await all(`SELECT id, email FROM users WHERE role = 'staff' AND "agencyId" IS NULL`);
  for (const u of legacyStaff) {
    await run(
      `UPDATE users SET "agencyId" = $1, "updatedAt" = $2 WHERE id = $3`,
      [defaultAgencyId, new Date().toISOString(), u.id]
    );
    console.log(`   🔄 Bound legacy staff → default agency: ${u.email}`);
  }
}

async function seed() {
  await initDb();
  console.log('\n🌱 Seeding multi-tenant baseline...');

  // 1. Ensure Bouatit Travel agency exists.
  const bouatit = await ensureAgency(BOUATIT_AGENCY_NAME, { email: BOUATIT_ADMIN.email });

  // 2. Backfill all existing trips/travelers/scan_events to Bouatit Travel,
  //    since the legacy single-tenant data belongs to that agency in practice.
  await backfillExistingData(bouatit.id);

  // 3. Ensure platform super_admin.
  await ensureUser(SUPER_ADMIN);

  // 4. Ensure Bouatit agency_admin (bound to Bouatit Travel).
  await ensureUser({ ...BOUATIT_ADMIN, agencyId: bouatit.id });

  const stats = {
    agencies: (await get(`SELECT COUNT(*)::int AS n FROM agencies`)).n,
    users:    (await get(`SELECT COUNT(*)::int AS n FROM users`)).n,
    trips:    (await get(`SELECT COUNT(*)::int AS n FROM trips`)).n,
    travelers:(await get(`SELECT COUNT(*)::int AS n FROM travelers`)).n,
  };

  console.log('');
  console.log('✅ Multi-tenant seed complete.');
  console.log(`   Agencies:  ${stats.agencies}`);
  console.log(`   Users:     ${stats.users}`);
  console.log(`   Trips:     ${stats.trips}`);
  console.log(`   Travelers: ${stats.travelers}`);
  console.log('');
  console.log('   🔐 Logins:');
  console.log(`      super_admin:   ${SUPER_ADMIN.email}`);
  console.log(`      agency_admin:  ${BOUATIT_ADMIN.email} (${BOUATIT_AGENCY_NAME})`);
  console.log('');

  await getPool().end();
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
