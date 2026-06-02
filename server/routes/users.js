const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db');
const { isSuperAdmin, isAgencyAdmin, effectiveAgencyId, requireManageUsers, AGENCY_USER_LIMIT } = require('../lib/scope');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Internally stored roles. Legacy 'admin' is still accepted on read; new
// users created here must use one of these.
const VALID_ROLES = new Set(['super_admin', 'agency_admin']);

function sanitize(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    agencyId: u.agencyId || null,
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
        `SELECT id, email, role, "agencyId", "createdAt", "updatedAt" FROM users ORDER BY "createdAt" ASC`
      );
    } else if (reqAgencyId) {
      scope = 'agency';
      // Own agency only. The agencyId comes from the session — any agencyId
      // sent in the query string is ignored. super_admins are excluded so an
      // agency admin can never see a platform account, and NULL-agency rows
      // can't match because the comparison is against a concrete agencyId.
      rows = await all(
        `SELECT id, email, role, "agencyId", "createdAt", "updatedAt"
           FROM users
          WHERE "agencyId" = $1 AND role <> 'super_admin'
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
    let role = typeof body.role === 'string' ? body.role : 'agency_admin';
    // Legacy alias: accept 'admin' from old UI, map to agency_admin.
    if (role === 'admin') role = 'agency_admin';
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
      if (role === 'super_admin') {
        return res.status(403).json({ error: 'Cannot create super_admin', code: 'FORBIDDEN' });
      }
      // agencyId is always forced from the session — any client-supplied
      // agencyId is ignored, so an agency_admin can never target another agency.
      agencyId = effectiveAgencyId(req.user);
      if (!agencyId) return res.status(403).json({ error: 'No agency on account', code: 'NO_AGENCY' });

      // Per-agency cap: at most AGENCY_USER_LIMIT non-super accounts. There is
      // no soft-delete in this schema, so we count every live user of the
      // agency except super_admins (who never belong to an agency anyway).
      const cnt = await get(
        `SELECT COUNT(*)::int AS n FROM users WHERE "agencyId" = $1 AND role <> 'super_admin'`,
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

    const existing = await get(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 10);

    await run(
      `INSERT INTO users (id, email, "passwordHash", role, "agencyId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, email, passwordHash, role, agencyId, now, now]
    );

    res.status(201).json(sanitize({ id, email, role, agencyId, createdAt: now, updatedAt: now }));
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

    const user = await get(`SELECT id, "agencyId", role FROM users WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!isSuperAdmin(req.user)) {
      if (user.role === 'super_admin') return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      if (user.agencyId !== effectiveAgencyId(req.user)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    await run(
      `UPDATE users SET "passwordHash" = $1, "updatedAt" = $2 WHERE id = $3`,
      [passwordHash, now, id]
    );

    await run(`DELETE FROM sessions WHERE "userId" = $1`, [id]);

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

    const user = await get(`SELECT id, role, "agencyId" FROM users WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!isSuperAdmin(req.user)) {
      if (user.role === 'super_admin') return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      if (user.agencyId !== effectiveAgencyId(req.user)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
      }
    }

    // Prevent deleting last super_admin (this guard is critical — it is
    // the only role that can recreate admins).
    if (user.role === 'super_admin') {
      const c = await get(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin'`);
      if (c && c.n <= 1) return res.status(400).json({ error: 'Cannot delete the last super_admin' });
    }
    // Legacy 'admin' (env-fallback shape) — same protection.
    if (user.role === 'admin' && !user.agencyId) {
      const c = await get(`SELECT COUNT(*)::int AS n FROM users WHERE role IN ('admin','super_admin') AND "agencyId" IS NULL`);
      if (c && c.n <= 1) return res.status(400).json({ error: 'Cannot delete the last admin user' });
    }
    // NOTE: super_admin is allowed to delete the last agency_admin of an
    // agency. The agency can run without an admin until super_admin
    // creates a new one or deletes the agency.

    await run(`DELETE FROM sessions WHERE "userId" = $1`, [id]);
    await run(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
