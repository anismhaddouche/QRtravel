const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');

const TRIP_STATUSES = ['active', 'archived', 'completed', 'cancelled'];
const MAX_NAME = 200;
const MAX_NOTES = 2000;
const MAX_DATE = 40;

function cleanStr(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

function validateStatus(s) {
  if (s === undefined || s === null || s === '') return null;
  if (typeof s !== 'string' || !TRIP_STATUSES.includes(s)) {
    const err = new Error(`status must be one of: ${TRIP_STATUSES.join(', ')}`);
    err.statusCode = 400; throw err;
  }
  return s;
}

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let trips;
    if (status) {
      trips = await all('SELECT * FROM trips WHERE status = $1 ORDER BY date DESC', [status]);
    } else {
      trips = await all('SELECT * FROM trips ORDER BY date DESC');
    }
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
    const trip = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
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
    const notes = body.notes === undefined ? '' : (cleanStr(body.notes, MAX_NOTES) || '');

    const id = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO trips (id, name, date, notes, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, date || now.split('T')[0], notes, 'active', now, now]
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
    const trip = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const body = req.body || {};
    const name = body.name === undefined ? null : cleanStr(body.name, MAX_NAME);
    const date = body.date === undefined ? null : cleanStr(body.date, MAX_DATE);
    const status = validateStatus(body.status);
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
    const trip = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    await run('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: `Trip "${trip.name}" and all associated data deleted` });
  } catch (err) {
    console.error('Error deleting trip:', err.message);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

module.exports = router;
