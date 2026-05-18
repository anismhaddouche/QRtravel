const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db');
const { requireSuperAdmin } = require('../lib/scope');

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
        (SELECT COUNT(*)::int FROM users     u WHERE u."agencyId" = a.id) AS "userCount",
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

// DELETE /api/agencies/:id — only if no users/trips/travelers remain.
router.delete('/:id', async (req, res) => {
  try {
    const ag = await get(`SELECT * FROM agencies WHERE id = $1`, [req.params.id]);
    if (!ag) return res.status(404).json({ error: 'Agency not found' });

    const counts = await get(`
      SELECT
        (SELECT COUNT(*)::int FROM users     WHERE "agencyId" = $1) AS users,
        (SELECT COUNT(*)::int FROM trips     WHERE "agencyId" = $1) AS trips,
        (SELECT COUNT(*)::int FROM travelers WHERE "agencyId" = $1) AS travelers
    `, [req.params.id]);

    if (counts.users > 0 || counts.trips > 0 || counts.travelers > 0) {
      return res.status(409).json({
        error: 'Cannot delete an agency that still has users, trips, or travelers. Deactivate it instead.',
        code: 'AGENCY_NOT_EMPTY',
        counts,
      });
    }

    await run(`DELETE FROM agencies WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Agency "${ag.name}" deleted` });
  } catch (err) {
    console.error('[AGENCIES] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete agency' });
  }
});

module.exports = router;
