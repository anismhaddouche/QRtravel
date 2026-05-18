// Create or update a user from the CLI.
//
// Usage:
//   node server/createUser.js <email> <password> <role> [agencyNameOrId]
//   npm run create-user -- <email> <password> <role> [agencyNameOrId]
//
// Roles: super_admin, agency_admin (legacy 'admin' accepted → agency_admin).
// - super_admin must NOT have an agency.
// - agency_admin MUST have an agencyNameOrId.
// - 'staff' role is no longer supported.
// If a user with the same email exists, password and role/agency are updated.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDb, get, run, getPool } = require('./db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['super_admin', 'agency_admin']);

function usage() {
  console.error('Usage: node server/createUser.js <email> <password> <role> [agencyNameOrId]');
  console.error('  roles: super_admin | agency_admin');
  console.error('  agency_admin requires an agency. super_admin must omit it.');
  process.exit(1);
}

async function resolveAgency(nameOrId) {
  if (!nameOrId) return null;
  let ag = await get(`SELECT * FROM agencies WHERE id = $1`, [nameOrId]);
  if (!ag) ag = await get(`SELECT * FROM agencies WHERE LOWER(name) = LOWER($1) LIMIT 1`, [nameOrId]);
  return ag;
}

async function main() {
  const [, , email, password, roleRawArg, agencyArg] = process.argv;
  let role = roleRawArg || 'agency_admin';
  if (role === 'admin') role = 'agency_admin';
  if (role === 'staff') {
    console.error('Role "staff" is no longer supported. Use agency_admin.');
    process.exit(1);
  }

  if (!email || !password) usage();
  if (!EMAIL_RE.test(email)) { console.error('Invalid email format.'); process.exit(1); }
  if (password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }
  if (!VALID_ROLES.has(role)) { console.error(`Invalid role "${role}".`); usage(); }

  await initDb();

  let agencyId = null;
  if (role === 'super_admin') {
    if (agencyArg) {
      console.error('super_admin must NOT have an agency. Omit the agency argument.');
      process.exit(1);
    }
  } else {
    if (!agencyArg) {
      console.error(`Role "${role}" requires an agencyNameOrId argument.`);
      process.exit(1);
    }
    const ag = await resolveAgency(agencyArg);
    if (!ag) {
      console.error(`Agency not found: ${agencyArg}`);
      process.exit(1);
    }
    agencyId = ag.id;
  }

  const existing = await get(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await run(
      `UPDATE users SET "passwordHash" = $1, role = $2, "agencyId" = $3, "updatedAt" = $4 WHERE id = $5`,
      [passwordHash, role, agencyId, now, existing.id]
    );
    await run(`DELETE FROM sessions WHERE "userId" = $1`, [existing.id]);
    console.log(`✅ Updated user: ${email} (role=${role}${agencyId ? `, agency=${agencyId}` : ''})`);
  } else {
    const id = uuidv4();
    await run(
      `INSERT INTO users (id, email, "passwordHash", role, "agencyId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [id, email, passwordHash, role, agencyId, now]
    );
    console.log(`✅ Created user: ${email} (role=${role}${agencyId ? `, agency=${agencyId}` : ''})`);
  }

  await getPool().end();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
