require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { all, get, run, initDb } = require('./db');
const { auth } = require('./auth');

async function migrate() {
  try {
    await initDb();
    console.log('[MIGRATION] Fetching existing legacy users...');
    const legacyUsers = await all(`SELECT * FROM users`);
    console.log(`[MIGRATION] Found ${legacyUsers.length} legacy users.`);

    for (const legacyUser of legacyUsers) {
      // Check if user already migrated
      const exists = await get(`SELECT id FROM "user" WHERE email = $1`, [legacyUser.email]);
      if (exists) {
        console.log(`[MIGRATION] User ${legacyUser.email} already migrated. Skipping.`);
        continue;
      }

      console.log(`[MIGRATION] Migrating user ${legacyUser.email}...`);

      const newId = uuidv4();
      
      // Map roles
      // If the legacy role was 'admin', it could mean super_admin or agency_admin in the app logic.
      // We will keep 'admin' as the role, which maps perfectly with scope.js rules!
      // (admin without agencyId = super_admin, admin with agencyId = agency_admin)
      // Actually, Better Auth requires the user table role to be mapped directly.
      const newRole = legacyUser.role;

      // Ensure no trial for existing users (null)
      const trialExpiresAt = null;

      // Insert into "user" table (Better Auth schema)
      await run(
        `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned, "trialExpiresAt", "agencyId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newId,
          legacyUser.email.split('@')[0], // name
          legacyUser.email,
          false,
          null, // image
          new Date(legacyUser.createdAt),
          new Date(legacyUser.updatedAt),
          newRole,
          false,
          trialExpiresAt,
          legacyUser.agencyId || null
        ]
      );

      // Insert into "account" table
      // Better auth credential plugin needs password hashed.
      const accountId = uuidv4();
      await run(
        `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          accountId,
          newId, // accountId for credential is the user ID or a random UUID
          'credential',
          newId,
          legacyUser.passwordHash,
          new Date(legacyUser.createdAt),
          new Date(legacyUser.updatedAt)
        ]
      );
    }
    
    console.log('[MIGRATION] Done migrating users.');
    process.exit(0);
  } catch (e) {
    console.error('[MIGRATION] Error:', e);
    process.exit(1);
  }
}

migrate();
