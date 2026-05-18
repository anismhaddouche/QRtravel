// Create or update a staff/admin user from the CLI.
//
// Usage:
//   node server/createUser.js <email> <password> [role]
//   npm run create-user -- <email> <password> [role]
//
// role defaults to "staff". Valid roles: admin, staff.
// If a user with the same email exists, its password and role are updated.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDb, get, run, getPool } = require('./db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['admin', 'staff']);

async function main() {
  const [, , email, password, roleArg] = process.argv;
  const role = roleArg || 'staff';

  if (!email || !password) {
    console.error('Usage: node server/createUser.js <email> <password> [admin|staff]');
    process.exit(1);
  }
  if (!EMAIL_RE.test(email)) {
    console.error('Invalid email format.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if (!VALID_ROLES.has(role)) {
    console.error(`Invalid role "${role}". Must be one of: admin, staff.`);
    process.exit(1);
  }

  await initDb();

  const existing = await get(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await run(
      `UPDATE users SET "passwordHash" = $1, role = $2, "updatedAt" = $3 WHERE id = $4`,
      [passwordHash, role, now, existing.id]
    );
    await run(`DELETE FROM sessions WHERE "userId" = $1`, [existing.id]);
    console.log(`✅ Updated existing user: ${email} (role=${role})`);
  } else {
    const id = uuidv4();
    await run(
      `INSERT INTO users (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, email, passwordHash, role, now, now]
    );
    console.log(`✅ Created user: ${email} (role=${role})`);
  }

  await getPool().end();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
