const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const { sanitizeDatabaseUrl, run } = require('./db');

if (!process.env.DATABASE_URL) {
  console.warn('[AUTH] DATABASE_URL is not set.');
}

let authInstance = null;

async function getAuth() {
  if (authInstance) return authInstance;

  const { betterAuth } = await import('better-auth');
  const { admin } = await import('better-auth/plugins');

  authInstance = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins: process.env.NODE_ENV !== 'production' 
      ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']
      : [],
    basePath: '/api/auth',
    database: process.env.DATABASE_URL ? new Pool({
      connectionString: sanitizeDatabaseUrl(process.env.DATABASE_URL),
      ssl: { rejectUnauthorized: false },
    }) : null,
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password) => {
          const bcrypt = require('bcryptjs');
          const rawHash = await bcrypt.hash(password, 10);
          return rawHash.startsWith('$2a$') ? rawHash.replace('$2a$', '$2b$') : rawHash;
        },
        verify: async ({ hash, password }) => {
          const bcrypt = require('bcryptjs');
          // better-auth might give us a $2b$ hash, but bcryptjs expects $2a$ for legacy matching
          const compareHash = hash.startsWith('$2b$') ? hash.replace('$2b$', '$2a$') : hash;
          try {
            return await bcrypt.compare(password, compareHash);
          } catch {
            return false;
          }
        }
      }
    },
    socialProviders: {},
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // cache 5 min
      },
    },
    user: {
      additionalFields: {
        trialExpiresAt: {
          type: 'date',
          required: false,
          defaultValue: null,
          input: false,
        },
        agencyId: {
          type: 'string',
          required: false,
          defaultValue: null,
          input: false,
        },
        phone: {
          type: 'string',
          required: false,
        },
      },
    },
    plugins: [
      admin({
        defaultRole: 'user', // sign-up default role
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const trialDate = new Date();
            trialDate.setDate(trialDate.getDate() + 7);

            const agencyId = uuidv4();
            const agencyName = user.name || 'Nouvelle Agence';
            const phone = user.phone || null;
            const now = new Date();

            try {
              await run(
                'INSERT INTO agencies (id, name, status, phone, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)',
                [agencyId, agencyName, 'active', phone, now, now]
              );
            } catch (err) {
              console.error('[AUTH HOOK] Failed to create default agency:', err);
            }

            return {
              data: {
                ...user,
                role: 'agency_admin',
                agencyId: agencyId,
                trialExpiresAt: trialDate
              }
            }
          },
        },
        update: {
          after: async (user) => {
            if (user.role === 'agency_admin' && user.agencyId) {
              try {
                await run(
                  'UPDATE "user" SET banned = $1, "banReason" = $2, "banExpires" = $3, "trialExpiresAt" = $4, "updatedAt" = $5 WHERE "agencyId" = $6 AND role = \'admin\'',
                  [user.banned || false, user.banReason || null, user.banExpires || null, user.trialExpiresAt || null, new Date(), user.agencyId]
                );
              } catch (err) {
                console.error('[AUTH HOOK] Failed to propagate admin_agency status to agency users:', err);
              }
            }
          }
        }
      }
    },
  });

  return authInstance;
}

module.exports = { getAuth };
