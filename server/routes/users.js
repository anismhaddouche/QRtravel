const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const { all, get, run } = require('../db');
const { isSuperAdmin, isAgencyAdmin, effectiveAgencyId, requireManageUsers, requireSuperAdmin, AGENCY_USER_LIMIT } = require('../lib/scope');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Internally stored roles. Legacy 'admin' is still accepted on read; new
// users created here must use one of these.
const VALID_ROLES = new Set(['super_admin', 'agency_admin', 'admin']);

function sanitize(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    agencyId: u.agencyId || null,
    trialExpiresAt: u.trialExpiresAt || null,
    phone: u.phone || null,
    banned: u.banned || false,
    banReason: u.banReason || null,
    banExpires: u.banExpires || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// User management is open to super_admin (global) and agency_admin (own
// agency only). Per-handler logic below forces agencyId, blocks creating
// super_admin from an agency_admin, and scopes every read/write by agency.
router.use(requireManageUsers);

router.get('/', async (req, res) => {
  try {
    const role = req.user?.role;
    const reqAgencyId = req.user?.agencyId || null;
    // Only a *true* super_admin gets the global, unscoped list. A legacy
    // 'admin' without an agencyId is NOT treated as global here: that path
    // historically leaked every account (incl. super_admins and other
    // agencies) to misconfigured accounts. Anyone else is scoped to their
    // own agency, and super_admins are never returned to them.
    const globalScope = role === 'super_admin';
    let rows;
    let scope;
    if (globalScope) {
      scope = 'global';
      rows = await all(
        `SELECT id, email, role, "agencyId", "trialExpiresAt", phone, banned, "banReason", "banExpires", "createdAt", "updatedAt" FROM "user" WHERE role IN ('agency_admin', 'super_admin') ORDER BY "createdAt" ASC`
      );
    } else if (reqAgencyId) {
      scope = 'agency';
      // Own agency only. The agencyId comes from the session — any agencyId
      // sent in the query string is ignored. super_admins are excluded so an
      // agency admin can never see a platform account, and NULL-agency rows
      // can't match because the comparison is against a concrete agencyId.
      rows = await all(
        `SELECT id, email, role, "agencyId", "trialExpiresAt", phone, banned, "banReason", "banExpires", "createdAt", "updatedAt"
           FROM "user"
          WHERE "agencyId" = $1 AND role = 'admin'
          ORDER BY "createdAt" ASC`,
        [reqAgencyId]
      );
    } else {
      // Manage-users caller without an agency and not a super_admin →
      // expose nothing rather than falling back to the global list.
      scope = 'none';
      rows = [];
    }
    // Temporary diagnostic (no secrets): confirms which scope was applied.
    console.log(`[USERS] list role=${role || 'null'} agencyId=${reqAgencyId || 'null'} scope=${scope} count=${rows.length}`);
    res.json(rows.map(sanitize));
  } catch (err) {
    console.error('[USERS] list error:', err.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    let role = typeof body.role === 'string' ? body.role : 'admin';
    // Explicit removal: 'staff' role no longer supported.
    if (role === 'staff') {
      return res.status(400).json({ error: 'Role "staff" is no longer supported', code: 'VALIDATION' });
    }

    if (!EMAIL_RE.test(email) || email.length > 200) {
      return res.status(400).json({ error: 'Invalid email', code: 'VALIDATION' });
    }
    if (!password || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must be 8–200 characters', code: 'VALIDATION' });
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'Invalid role', code: 'VALIDATION' });
    }

    // Authorization rules:
    //   super_admin: can create any role; must supply agencyId for non-super roles.
    //   agency_admin: cannot create super_admin; agencyId is forced to own.
    let agencyId;
    if (isSuperAdmin(req.user)) {
      if (role === 'super_admin') {
        agencyId = null;
      } else {
        agencyId = typeof body.agencyId === 'string' && body.agencyId.trim() ? body.agencyId.trim() : null;
        if (!agencyId) return res.status(400).json({ error: 'agencyId is required for this role' });
        const ag = await get('SELECT id FROM agencies WHERE id = $1', [agencyId]);
        if (!ag) return res.status(400).json({ error: 'Unknown agencyId' });
      }
    } else if (isAgencyAdmin(req.user)) {
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Un administrateur d\'agence ne peut créer que des comptes de type personnel (admin).', code: 'FORBIDDEN' });
      }
      // agencyId is always forced from the session — any client-supplied
      // agencyId is ignored, so an agency_admin can never target another agency.
      agencyId = effectiveAgencyId(req.user);
      if (!agencyId) return res.status(403).json({ error: 'No agency on account', code: 'NO_AGENCY' });

      // Per-agency cap: at most AGENCY_USER_LIMIT non-super accounts. There is
      // no soft-delete in this schema, so we count every live user of the
      // agency except super_admins (who never belong to an agency anyway).
      const cnt = await get(
        `SELECT COUNT(*)::int AS n FROM "user" WHERE "agencyId" = $1 AND role = 'admin'`,
        [agencyId]
      );
      if (cnt && cnt.n >= AGENCY_USER_LIMIT) {
        return res.status(409).json({
          error: `Limite atteinte : cette agence peut avoir au maximum ${AGENCY_USER_LIMIT} comptes personnel.`,
          code: 'USER_LIMIT_REACHED',
          limit: AGENCY_USER_LIMIT,
        });
      }
    } else {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const existing = await get(`SELECT id FROM "user" WHERE LOWER(email) = LOWER($1)`, [email]);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const id = uuidv4();
    const now = new Date();
    const rawHash = await bcrypt.hash(password, 10);
    const passwordHash = rawHash.startsWith('$2a$') ? rawHash.replace('$2a$', '$2b$') : rawHash;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null;

    let trialExpiresAt = null;
    if (agencyId) {
      const agencyAdmin = await get(
        `SELECT "trialExpiresAt" FROM "user" WHERE "agencyId" = $1 AND role = 'agency_admin' LIMIT 1`,
        [agencyId]
      );
      if (agencyAdmin && agencyAdmin.trialExpiresAt) {
        trialExpiresAt = agencyAdmin.trialExpiresAt;
      }
    }

    await run(
      `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned, "trialExpiresAt", "agencyId", phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, email.split('@')[0], email, false, null, now, now, role, false, trialExpiresAt, agencyId, phone]
    );

    const accountId = uuidv4();
    await run(
      `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [accountId, id, 'credential', id, passwordHash, now, now]
    );

    res.status(201).json(sanitize({ id, email, role, agencyId, trialExpiresAt, phone, createdAt: now.toISOString(), updatedAt: now.toISOString() }));
  } catch (err) {
    console.error('[USERS] create error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!password || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must be 8–200 characters' });
    }

    const user = await get(`SELECT id, "agencyId", role FROM "user" WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!isSuperAdmin(req.user)) {
      if (user.role === 'super_admin') return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      if (user.agencyId !== effectiveAgencyId(req.user)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
      }
    }

    const rawHash = await bcrypt.hash(password, 10);
    const passwordHash = rawHash.startsWith('$2a$') ? rawHash.replace('$2a$', '$2b$') : rawHash;
    const now = new Date();

    await run(
      `UPDATE "account" SET password = $1, "updatedAt" = $2 WHERE "userId" = $3 AND "providerId" = 'credential'`,
      [passwordHash, now, id]
    );

    await run(`DELETE FROM "session" WHERE "userId" = $1`, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] reset-password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user?.id && req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await get(`SELECT id, role, "agencyId" FROM "user" WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!isSuperAdmin(req.user)) {
      if (user.role === 'super_admin') return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      if (user.agencyId !== effectiveAgencyId(req.user)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
      }
    }

    // Prevent deleting last super_admin
    if (user.role === 'super_admin') {
      const c = await get(`SELECT COUNT(*)::int AS n FROM "user" WHERE role = 'super_admin'`);
      if (c && c.n <= 1) return res.status(400).json({ error: 'Cannot delete the last super_admin' });
    }

    // If deleting the main agency owner (agency_admin), delete all associated personnel accounts
    if (user.role === 'agency_admin' && user.agencyId) {
      await run(
        `DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE "agencyId" = $1 AND role IN ('agency_admin', 'admin'))`,
        [user.agencyId]
      );
      await run(
        `DELETE FROM "account" WHERE "userId" IN (SELECT id FROM "user" WHERE "agencyId" = $1 AND role IN ('agency_admin', 'admin'))`,
        [user.agencyId]
      );
      await run(
        `DELETE FROM "user" WHERE "agencyId" = $1 AND role IN ('agency_admin', 'admin')`,
        [user.agencyId]
      );
    } else {
      // Normal single user delete
      await run(`DELETE FROM "session" WHERE "userId" = $1`, [id]);
      await run(`DELETE FROM "account" WHERE "userId" = $1`, [id]);
      await run(`DELETE FROM "user" WHERE id = $1`, [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/:id/extend-trial', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { months } = req.body || {};
    const monthsInt = parseInt(months, 10);

    if (isNaN(monthsInt) || monthsInt < 1 || monthsInt > 24) {
      return res.status(400).json({ error: 'Le nombre de mois doit être compris entre 1 et 24.', code: 'VALIDATION' });
    }

    // Fetch the target user's current trialExpiresAt
    const user = await get('SELECT id, role, "agencyId", "trialExpiresAt" FROM "user" WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let baseDate = new Date();
    if (user.trialExpiresAt) {
      const currentExpiry = new Date(user.trialExpiresAt);
      if (currentExpiry > baseDate) {
        baseDate = currentExpiry;
      }
    }

    baseDate.setMonth(baseDate.getMonth() + monthsInt);

    // Update in database directly
    const now = new Date();
    await run(
      'UPDATE "user" SET "trialExpiresAt" = $1, "updatedAt" = $2 WHERE id = $3',
      [baseDate, now, id]
    );

    // Propagate trialExpiresAt to all admin users of the same agency if the target user is the agency_admin
    if (user.role === 'agency_admin' && user.agencyId) {
      await run(
        'UPDATE "user" SET "trialExpiresAt" = $1, "updatedAt" = $2 WHERE "agencyId" = $3 AND role = \'admin\'',
        [baseDate, now, user.agencyId]
      );
    }

    // Unban the user in case they were banned due to trial expiration
    try {
      const { getAuth } = require('../auth');
      const auth = await getAuth();
      await auth.api.unbanUser({
        headers: req.headers,
        body: { userId: id }
      });
    } catch (e) {
      // Ignore error if user is not banned
    }

    res.json({ success: true, trialExpiresAt: baseDate });
  } catch (err) {
    console.error('[USERS] extend-trial error:', err.message);
    res.status(500).json({ error: 'Failed to extend trial' });
  }
});

router.post('/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const user = await get('SELECT id, role, "agencyId" FROM "user" WHERE id = $1', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Permission checks
    if (!isSuperAdmin(req.user)) {
      if (user.role === 'super_admin' || user.role === 'agency_admin') {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      if (user.agencyId !== effectiveAgencyId(req.user)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
      }
    }

    const now = new Date();
    // Update user to banned in DB
    await run(
      'UPDATE "user" SET banned = $1, "banReason" = $2, "banExpires" = $3, "updatedAt" = $4 WHERE id = $5',
      [true, reason || 'Compte bloqué', null, now, id]
    );

    // Propagate to all admin users of the same agency if target is agency_admin
    if (user.role === 'agency_admin' && user.agencyId) {
      await run(
        'UPDATE "user" SET banned = $1, "banReason" = $2, "banExpires" = $3, "updatedAt" = $4 WHERE "agencyId" = $5 AND role = \'admin\'',
        [true, reason || 'Compte bloqué', null, now, user.agencyId]
      );
    }

    // Revoke sessions so the users are immediately logged out
    await run('DELETE FROM "session" WHERE "userId" = $1', [id]);
    if (user.role === 'agency_admin' && user.agencyId) {
      await run(
        `DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE "agencyId" = $1 AND role = 'admin')`,
        [user.agencyId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] ban error:', err.message);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

router.post('/:id/unban', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await get('SELECT id, role, "agencyId" FROM "user" WHERE id = $1', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Permission checks
    if (!isSuperAdmin(req.user)) {
      if (user.role === 'super_admin' || user.role === 'agency_admin') {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      if (user.agencyId !== effectiveAgencyId(req.user)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
      }
    }

    const now = new Date();
    // Update user to unbanned in DB
    await run(
      'UPDATE "user" SET banned = $1, "banReason" = $2, "banExpires" = $3, "updatedAt" = $4 WHERE id = $5',
      [false, null, null, now, id]
    );

    // Propagate to all admin users of the same agency if target is agency_admin
    if (user.role === 'agency_admin' && user.agencyId) {
      await run(
        'UPDATE "user" SET banned = $1, "banReason" = $2, "banExpires" = $3, "updatedAt" = $4 WHERE "agencyId" = $5 AND role = \'admin\'',
        [false, null, null, now, user.agencyId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] unban error:', err.message);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

module.exports = router;
