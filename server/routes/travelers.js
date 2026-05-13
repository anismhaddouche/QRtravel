const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');

const TYPES = ['person', 'couple', 'family', 'group'];
const TRAVELER_STATUSES = ['not_checked_in', 'checked_in'];
const REF_CODE_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const MAX_NAME = 200;
const MAX_NOTES = 2000;
const MIN_PEOPLE = 1;
const MAX_PEOPLE = 200;

function cleanStr(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

function validateRefCode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  return REF_CODE_RE.test(s) ? s : null;
}

function validateType(v, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) { const err = new Error('type is required'); err.statusCode = 400; throw err; }
    return null;
  }
  if (!TYPES.includes(v)) {
    const err = new Error(`type must be one of: ${TYPES.join(', ')}`);
    err.statusCode = 400; throw err;
  }
  return v;
}

function validateStatus(v) {
  if (v === undefined || v === null || v === '') return null;
  if (!TRAVELER_STATUSES.includes(v)) {
    const err = new Error(`status must be one of: ${TRAVELER_STATUSES.join(', ')}`);
    err.statusCode = 400; throw err;
  }
  return v;
}

function validatePeopleCount(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_PEOPLE || n > MAX_PEOPLE) {
    const err = new Error(`peopleCount must be an integer between ${MIN_PEOPLE} and ${MAX_PEOPLE}`);
    err.statusCode = 400; throw err;
  }
  return n;
}

// GET /api/travelers/stats/summary — dashboard stats (MUST come before /:id)
router.get('/stats/summary', async (req, res) => {
  try {
    const tripId = req.query.tripId;
    if (!tripId) return res.status(400).json({ error: 'tripId query param is required' });

    const total = await get('SELECT COUNT(*) as count FROM travelers WHERE "tripId" = $1', [tripId]);
    const checkedIn = await get(`SELECT COUNT(*) as count FROM travelers WHERE "tripId" = $1 AND status = 'checked_in'`, [tripId]);
    const totalPeople = await get('SELECT COALESCE(SUM("peopleCount"), 0) as count FROM travelers WHERE "tripId" = $1', [tripId]);
    const checkedInPeople = await get(`SELECT COALESCE(SUM("peopleCount"), 0) as count FROM travelers WHERE "tripId" = $1 AND status = 'checked_in'`, [tripId]);

    res.json({
      totalUnits: parseInt(total.count),
      checkedInUnits: parseInt(checkedIn.count),
      missingUnits: parseInt(total.count) - parseInt(checkedIn.count),
      totalPeople: parseInt(totalPeople.count),
      checkedInPeople: parseInt(checkedInPeople.count),
      missingPeople: parseInt(totalPeople.count) - parseInt(checkedInPeople.count),
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/travelers — list all travelers (requires tripId)
router.get('/', async (req, res) => {
  try {
    const { tripId } = req.query;
    let travelers;
    if (tripId) {
      travelers = await all('SELECT * FROM travelers WHERE "tripId" = $1 ORDER BY "referenceCode"', [tripId]);
    } else {
      travelers = await all('SELECT * FROM travelers ORDER BY "referenceCode"');
    }
    res.json(travelers);
  } catch (err) {
    console.error('Error fetching travelers:', err);
    res.status(500).json({ error: 'Failed to fetch travelers' });
  }
});

// GET /api/travelers/:id
router.get('/:id', async (req, res) => {
  try {
    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });
    res.json(traveler);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch traveler' });
  }
});

// POST /api/travelers — create a new traveler unit
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const referenceCode = validateRefCode(body.referenceCode);
    const displayName = cleanStr(body.displayName, MAX_NAME);
    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';

    if (!referenceCode || !displayName || !tripId) {
      return res.status(400).json({ error: 'referenceCode, displayName, type, and tripId are required' });
    }

    const type = validateType(body.type, { required: true });
    const peopleCount = validatePeopleCount(body.peopleCount);
    const notes = body.notes === undefined ? '' : (cleanStr(body.notes, MAX_NOTES) || '');

    const trip = await get('SELECT id FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const existing = await get('SELECT id FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
    if (existing) {
      return res.status(409).json({ error: 'A traveler with this reference code already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const count = peopleCount ?? (type === 'person' ? 1 : type === 'couple' ? 2 : 3);

    await run(
      `INSERT INTO travelers (id, "referenceCode", "displayName", type, "peopleCount", notes, "tripId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, referenceCode, displayName, type, count, notes, tripId, now, now]
    );

    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [id]);
    res.status(201).json(traveler);
  } catch (err) {
    if (err && err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Error creating traveler:', err.message);
    res.status(500).json({ error: 'Failed to create traveler' });
  }
});

// PUT /api/travelers/:id — update a traveler unit
router.put('/:id', async (req, res) => {
  try {
    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    const body = req.body || {};
    const displayName = body.displayName === undefined ? null : cleanStr(body.displayName, MAX_NAME);
    const type = validateType(body.type);
    const peopleCount = validatePeopleCount(body.peopleCount);
    const status = validateStatus(body.status);
    const notes = body.notes === undefined ? null : (cleanStr(body.notes, MAX_NOTES) || '');
    const now = new Date().toISOString();

    await run(
      `UPDATE travelers
       SET "displayName" = COALESCE($1, "displayName"),
           type = COALESCE($2, type),
           "peopleCount" = COALESCE($3, "peopleCount"),
           notes = COALESCE($4, notes),
           status = COALESCE($5, status),
           "updatedAt" = $6
       WHERE id = $7`,
      [displayName, type, peopleCount, notes, status, now, req.params.id]
    );

    const updated = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    if (err && err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Error updating traveler:', err.message);
    res.status(500).json({ error: 'Failed to update traveler' });
  }
});

// DELETE /api/travelers/:id
router.delete('/:id', async (req, res) => {
  try {
    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    // Delete related scan events first
    await run('DELETE FROM scan_events WHERE "referenceCode" = $1', [traveler.referenceCode]);
    await run('DELETE FROM travelers WHERE id = $1', [req.params.id]);
    
    res.json({ success: true, message: `${traveler.displayName} deleted` });
  } catch (err) {
    console.error('Error deleting traveler:', err);
    res.status(500).json({ error: 'Failed to delete traveler' });
  }
});

module.exports = router;
