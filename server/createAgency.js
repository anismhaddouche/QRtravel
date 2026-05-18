// Create an agency from the CLI. Idempotent — if an agency with the
// same name (case-insensitive) already exists, it is returned unchanged.
//
// Usage:
//   node server/createAgency.js "<name>" [email] [phone]
//   npm run create-agency -- "Bouatit Travel" bouatit@example.com

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { initDb, get, run, getPool } = require('./db');

async function main() {
  const [, , nameArg, emailArg, phoneArg] = process.argv;
  const name = (nameArg || '').trim();
  if (!name) {
    console.error('Usage: node server/createAgency.js "<name>" [email] [phone]');
    process.exit(1);
  }

  await initDb();

  const existing = await get(`SELECT * FROM agencies WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  if (existing) {
    console.log(`Agency already exists: ${existing.name} (${existing.id})`);
    await getPool().end();
    process.exit(0);
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO agencies (id, name, email, phone, status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'active', $5, $5)`,
    [id, name, emailArg || null, phoneArg || null, now]
  );

  console.log(`✅ Created agency: ${name} (${id})`);
  await getPool().end();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
