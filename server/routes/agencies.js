const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const { all, get, run, getPool } = require('../db');
const { requireSuperAdmin } = require('../lib/scope');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME = 200;
const MAX_EMAIL = 200;
const MAX_PHONE = 50;
const VALID_STATUS = new Set(['active', 'inactive']);

function cleanStr(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

// All agency routes require super_admin.
router.use(requireSuperAdmin);

// GET /api/agencies — list with counts
router.get('/', async (req, res) => {
  try {
    const rows = await all(`
      SELECT a.*,
        (SELECT COUNT(*)::int FROM "user"     u WHERE u."agencyId" = a.id) AS "userCount",
        (SELECT COUNT(*)::int FROM trips     t WHERE t."agencyId" = a.id) AS "tripCount",
        (SELECT COUNT(*)::int FROM travelers v WHERE v."agencyId" = a.id) AS "travelerCount"
      FROM agencies a
      ORDER BY a."createdAt" ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[AGENCIES] list error:', err.message);
    res.status(500).json({ error: 'Failed to list agencies' });
  }
});

// GET /api/agencies/:id
router.get('/:id', async (req, res) => {
  try {
    const ag = await get(`SELECT * FROM agencies WHERE id = $1`, [req.params.id]);
    if (!ag) return res.status(404).json({ error: 'Agency not found' });
    res.json(ag);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch agency' });
  }
});

// POST /api/agencies
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const name = cleanStr(body.name, MAX_NAME);
    if (!name) return res.status(400).json({ error: 'name is required', code: 'VALIDATION' });

    const email = body.email === undefined ? null : cleanStr(body.email, MAX_EMAIL);
    const phone = body.phone === undefined ? null : cleanStr(body.phone, MAX_PHONE);

    const dup = await get(`SELECT id FROM agencies WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
    if (dup) return res.status(409).json({ error: 'An agency with this name already exists' });

    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO agencies (id, name, email, phone, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'active', $5, $5)`,
      [id, name, email, phone, now]
    );

    const ag = await get(`SELECT * FROM agencies WHERE id = $1`, [id]);
    res.status(201).json(ag);
  } catch (err) {
    console.error('[AGENCIES] create error:', err.message);
    res.status(500).json({ error: 'Failed to create agency' });
  }
});

// PUT /api/agencies/:id
router.put('/:id', async (req, res) => {
  try {
    const ag = await get(`SELECT * FROM agencies WHERE id = $1`, [req.params.id]);
    if (!ag) return res.status(404).json({ error: 'Agency not found' });

    const body = req.body || {};
    const name   = body.name   === undefined ? null : cleanStr(body.name, MAX_NAME);
    const email  = body.email  === undefined ? null : (cleanStr(body.email, MAX_EMAIL) || '');
    const phone  = body.phone  === undefined ? null : (cleanStr(body.phone, MAX_PHONE) || '');
    let status   = body.status === undefined ? null : body.status;
    if (status !== null && !VALID_STATUS.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...VALID_STATUS].join(', ')}`, code: 'VALIDATION' });
    }

    if (name) {
      const dup = await get(
        `SELECT id FROM agencies WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1`,
        [name, req.params.id]
      );
      if (dup) return res.status(409).json({ error: 'An agency with this name already exists' });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE agencies SET
        name   = COALESCE($1, name),
        email  = COALESCE($2, email),
        phone  = COALESCE($3, phone),
        status = COALESCE($4, status),
        "updatedAt" = $5
       WHERE id = $6`,
      [name, email, phone, status, now, req.params.id]
    );

    const updated = await get(`SELECT * FROM agencies WHERE id = $1`, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('[AGENCIES] update error:', err.message);
    res.status(500).json({ error: 'Failed to update agency' });
  }
});

// POST /api/agencies/with-admin
// Transactional: creates the agency and its agency_admin user in one shot.
// Rolls back if either step fails. Never returns the password.
router.post('/with-admin', async (req, res) => {
  const body = req.body || {};
  const agencyIn = body.agency || {};
  const adminIn  = body.admin  || {};

  const name  = cleanStr(agencyIn.name, MAX_NAME);
  const aEmail = agencyIn.email === undefined ? null : cleanStr(agencyIn.email, MAX_EMAIL);
  const aPhone = agencyIn.phone === undefined ? null : cleanStr(agencyIn.phone, MAX_PHONE);
  const adminEmail    = typeof adminIn.email === 'string' ? adminIn.email.trim() : '';
  const adminPassword = typeof adminIn.password === 'string' ? adminIn.password : '';

  if (!name)                                   return res.status(400).json({ error: 'agency.name is required', code: 'VALIDATION' });
  if (!EMAIL_RE.test(adminEmail))              return res.status(400).json({ error: 'admin.email is invalid', code: 'VALIDATION' });
  if (adminPassword.length < 8 || adminPassword.length > 200) {
    return res.status(400).json({ error: 'admin.password must be 8–200 characters', code: 'VALIDATION' });
  }

  const dupAgency = await get(`SELECT id FROM agencies WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  if (dupAgency) return res.status(409).json({ error: 'An agency with this name already exists' });

  const dupUser = await get(`SELECT id FROM "user" WHERE LOWER(email) = LOWER($1)`, [adminEmail]);
  if (dupUser) return res.status(409).json({ error: 'A user with this email already exists' });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const agencyId = uuidv4();
  const userId   = uuidv4();
  const now = new Date().toISOString();

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO agencies (id, name, email, phone, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'active', $5, $5)`,
      [agencyId, name, aEmail, aPhone, now]
    );
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned, "trialExpiresAt", "agencyId")
       VALUES ($1, $2, $3, false, null, $4, $4, 'agency_admin', false, $5, $6)`,
      [userId, adminEmail.split('@')[0], adminEmail, new Date(now), new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000), agencyId]
    );
    const accountId = uuidv4();
    await client.query(
      `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
      [accountId, userId, userId, passwordHash, new Date(now)]
    );
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[AGENCIES] with-admin tx error:', err.message);
    return res.status(500).json({ error: 'Failed to create agency and admin' });
  } finally {
    client.release();
  }

  const agency = await get(`SELECT * FROM agencies WHERE id = $1`, [agencyId]);
  const admin  = await get(`SELECT id, email, role, "agencyId", "createdAt", "updatedAt" FROM "user" WHERE id = $1`, [userId]);
  res.status(201).json({ agency, admin });
});

// DELETE /api/agencies/:id  — empty agency: simple delete.
//   ?force=true (or body { force:true }): transactional purge of all
//   linked sessions, scan_events, travelers, trips, agency users (NEVER
//   super_admin), then the agency.
router.delete('/:id', async (req, res) => {
  try {
    const ag = await get(`SELECT * FROM agencies WHERE id = $1`, [req.params.id]);
    if (!ag) return res.status(404).json({ error: 'Agency not found' });

    const counts = await get(`
      SELECT
        (SELECT COUNT(*)::int FROM "user"        WHERE "agencyId" = $1) AS users,
        (SELECT COUNT(*)::int FROM trips        WHERE "agencyId" = $1) AS trips,
        (SELECT COUNT(*)::int FROM travelers    WHERE "agencyId" = $1) AS travelers,
        (SELECT COUNT(*)::int FROM scan_events  WHERE "agencyId" = $1) AS "scanEvents"
    `, [req.params.id]);

    const force = req.query.force === 'true' || req.body?.force === true;
    const isEmpty = counts.users === 0 && counts.trips === 0
      && counts.travelers === 0 && counts.scanEvents === 0;

    if (!isEmpty && !force) {
      return res.status(409).json({
        error: 'Agency still contains users, trips, travelers, or scan events. Pass force=true to purge.',
        code: 'AGENCY_NOT_EMPTY',
        counts,
      });
    }

    // Hard refusal: never let a force-delete touch a super_admin row,
    // even if one is mis-bound to this agency.
    const trapped = await get(
      `SELECT COUNT(*)::int AS n FROM "user" WHERE "agencyId" = $1 AND role = 'super_admin'`,
      [req.params.id]
    );
    if (trapped && trapped.n > 0) {
      return res.status(409).json({
        error: 'A super_admin is bound to this agency. Re-assign or delete it first.',
        code: 'SUPER_ADMIN_IN_AGENCY',
      });
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // Revoke sessions of users in this agency.
      await client.query(
        `DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE "agencyId" = $1)`,
        [req.params.id]
      );
      // Purge child rows. agencyId FKs are ON DELETE CASCADE for the
      // data tables, so the agency DELETE would cascade anyway — but we
      // do it explicitly inside the transaction so a partial failure
      // rolls back cleanly and we never leave orphans on legacy rows.
      await client.query(`DELETE FROM scan_events WHERE "agencyId" = $1`, [req.params.id]);
      await client.query(`DELETE FROM travelers   WHERE "agencyId" = $1`, [req.params.id]);
      await client.query(`DELETE FROM trips       WHERE "agencyId" = $1`, [req.params.id]);
      // Only agency-scoped roles. NEVER super_admin (guarded above too).
      await client.query(
        `DELETE FROM "account" WHERE "userId" IN (SELECT id FROM "user" WHERE "agencyId" = $1 AND role IN ('agency_admin','admin'))`,
        [req.params.id]
      );
      await client.query(
        `DELETE FROM "user" WHERE "agencyId" = $1 AND role IN ('agency_admin','admin')`,
        [req.params.id]
      );
      await client.query(`DELETE FROM agencies WHERE id = $1`, [req.params.id]);
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      console.error('[AGENCIES] force-delete tx error:', err.message);
      return res.status(500).json({ error: 'Failed to delete agency', code: 'DELETE_FAILED' });
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: `Agency "${ag.name}" deleted`,
      purged: force ? counts : null,
    });
  } catch (err) {
    console.error('[AGENCIES] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete agency' });
  }
});

module.exports = router;
