const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { isSuperAdmin, effectiveAgencyId } = require('../lib/scope');

const TRIP_STATUSES = ['active', 'archived', 'completed', 'cancelled'];
const MAX_TRIPS_PER_AGENCY = 3;
const TRIP_LIMIT_MESSAGE = 'Cette agence a déjà 3 voyages. Supprimez un voyage existant avant d\'en créer un nouveau.';
const MAX_NAME = 200;
const MAX_NOTES = 2000;
const MAX_DATE = 40;

function cleanStr(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Refuse dates strictement passées au format YYYY-MM-DD UNIQUEMENT pour
// les voyages dont le statut est 'active' ("En cours"). Les voyages
// 'completed' et 'archived' peuvent porter une date passée (clôture
// rétroactive, archivage). status null/undefined → on assume 'active'
// (statut par défaut côté backend).
//   - null/undefined/'' pour `date` = pas de validation (champ optionnel).
//   - Format non YYYY-MM-DD = pas de validation (compat données existantes).
function validateTripDate(date, status) {
  if (date === null || date === undefined || date === '') return;
  if (typeof date !== 'string') return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const effectiveStatus = status || 'active';
  if (effectiveStatus !== 'active') return;
  if (date < todayYYYYMMDD()) {
    const err = new Error('Un voyage en cours ne peut pas avoir une date passée.');
    err.statusCode = 400;
    throw err;
  }
}

function validateStatus(s) {
  if (s === undefined || s === null || s === '') return null;
  if (typeof s !== 'string' || !TRIP_STATUSES.includes(s)) {
    const err = new Error(`status must be one of: ${TRIP_STATUSES.join(', ')}`);
    err.statusCode = 400; throw err;
  }
  return s;
}

// Fetch a trip enforcing tenant scope. Returns null if not visible.
async function fetchScopedTrip(user, tripId) {
  const trip = await get('SELECT * FROM trips WHERE id = $1', [tripId]);
  if (!trip) return null;
  if (!isSuperAdmin(user) && trip.agencyId !== effectiveAgencyId(user)) return null;
  return trip;
}

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const superAdmin = isSuperAdmin(req.user);
    // super_admin may optionally filter by agencyId
    const agencyFilter = superAdmin ? (req.query.agencyId || null) : effectiveAgencyId(req.user);

    const where = [];
    const params = [];
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (agencyFilter) { params.push(agencyFilter); where.push(`"agencyId" = $${params.length}`); }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const trips = await all(`SELECT * FROM trips${whereSql} ORDER BY date DESC`, params);

    const enriched = await Promise.all(trips.map(async (trip) => {
      const total = await get('SELECT COUNT(*) as count FROM travelers WHERE "tripId" = $1', [trip.id]);
      const checkedIn = await get(`SELECT COUNT(*) as count FROM travelers WHERE "tripId" = $1 AND status = 'checked_in'`, [trip.id]);
      const totalPeople = await get('SELECT COALESCE(SUM("peopleCount"), 0) as count FROM travelers WHERE "tripId" = $1', [trip.id]);
      return {
        ...trip,
        travelerCount: parseInt(total.count),
        checkedInCount: parseInt(checkedIn.count),
        totalPeople: parseInt(totalPeople.count),
      };
    }));
    res.json(enriched);
  } catch (err) {
    console.error('Error fetching trips:', err.message);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const trip = await fetchScopedTrip(req.user, req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const name = cleanStr(body.name, MAX_NAME);
    if (!name) return res.status(400).json({ error: 'name is required', code: 'VALIDATION' });
    const date = cleanStr(body.date, MAX_DATE);
    // Honor the requested status (defaulting to 'active'). Past dates
    // are only rejected for 'active' trips; completed/archived trips
    // may carry a retroactive date.
    const status = validateStatus(body.status) || 'active';
    validateTripDate(date, status);
    const notes = body.notes === undefined ? '' : (cleanStr(body.notes, MAX_NOTES) || '');

    // agencyId selection:
    //   non-super: always derived from req.user (body value ignored)
    //   super_admin: may pass agencyId in body
    let agencyId;
    if (isSuperAdmin(req.user)) {
      agencyId = typeof body.agencyId === 'string' && body.agencyId.trim() ? body.agencyId.trim() : null;
      if (!agencyId) {
        return res.status(400).json({ error: 'agencyId is required for super_admin', code: 'VALIDATION' });
      }
      const ag = await get('SELECT id FROM agencies WHERE id = $1', [agencyId]);
      if (!ag) return res.status(400).json({ error: 'Unknown agencyId', code: 'VALIDATION' });
    } else {
      agencyId = req.user.agencyId;
      if (!agencyId) return res.status(403).json({ error: 'No agency on account', code: 'NO_AGENCY' });
    }

    // Enforce the per-agency trip cap. Applies to every caller —
    // super_admin too, since the limit is a property of the agency.
    const tripCount = await get(
      'SELECT COUNT(*) AS count FROM trips WHERE "agencyId" = $1',
      [agencyId]
    );
    if (parseInt(tripCount.count, 10) >= MAX_TRIPS_PER_AGENCY) {
      return res.status(409).json({
        error: TRIP_LIMIT_MESSAGE,
        code: 'TRIP_LIMIT_REACHED',
        limit: MAX_TRIPS_PER_AGENCY,
      });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO trips (id, name, date, notes, status, "agencyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, date || now.split('T')[0], notes, status, agencyId, now, now]
    );

    const trip = await get('SELECT * FROM trips WHERE id = $1', [id]);
    res.status(201).json(trip);
  } catch (err) {
    if (err && err.statusCode === 400) return res.status(400).json({ error: err.message, code: 'VALIDATION' });
    console.error('Error creating trip:', err.message);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const trip = await fetchScopedTrip(req.user, req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const body = req.body || {};
    const name = body.name === undefined ? null : cleanStr(body.name, MAX_NAME);
    const date = body.date === undefined ? null : cleanStr(body.date, MAX_DATE);
    const status = validateStatus(body.status);
    // Validate the date against the EFFECTIVE status after the PUT —
    // i.e. the incoming status if provided, otherwise the existing one.
    // This way, switching to 'completed'/'archived' lifts the past-date
    // restriction even when both the date and the status change together.
    if (body.date !== undefined) {
      const effectiveStatus = status || trip.status || 'active';
      validateTripDate(date, effectiveStatus);
    }
    const notes = body.notes === undefined ? null : (cleanStr(body.notes, MAX_NOTES) || '');
    const now = new Date().toISOString();

    await run(
      `UPDATE trips SET
        name = COALESCE($1, name),
        date = COALESCE($2, date),
        status = COALESCE($3, status),
        notes = COALESCE($4, notes),
        "updatedAt" = $5
      WHERE id = $6`,
      [name, date, status, notes, now, req.params.id]
    );

    const updated = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    if (err && err.statusCode === 400) return res.status(400).json({ error: err.message, code: 'VALIDATION' });
    console.error('Error updating trip:', err.message);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const trip = await fetchScopedTrip(req.user, req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    await run('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: `Trip "${trip.name}" and all associated data deleted` });
  } catch (err) {
    console.error('Error deleting trip:', err.message);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

module.exports = router;
