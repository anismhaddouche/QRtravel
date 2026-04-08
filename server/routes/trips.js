const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/trips — list all trips
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let trips;
    if (status) {
      trips = await all('SELECT * FROM trips WHERE status = $1 ORDER BY date DESC', [status]);
    } else {
      trips = await all('SELECT * FROM trips ORDER BY date DESC');
    }

    // Attach stats to each trip
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
    console.error('Error fetching trips:', err);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// GET /api/trips/:id
router.get('/:id', async (req, res) => {
  try {
    const trip = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

// POST /api/trips — create a new trip
router.post('/', async (req, res) => {
  try {
    const { name, date, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO trips (id, name, date, notes, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, date || now.split('T')[0], notes || '', 'active', now, now]
    );

    const trip = await get('SELECT * FROM trips WHERE id = $1', [id]);
    res.status(201).json(trip);
  } catch (err) {
    console.error('Error creating trip:', err);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// PUT /api/trips/:id
router.put('/:id', async (req, res) => {
  try {
    const trip = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { name, date, status, notes } = req.body;
    const now = new Date().toISOString();

    await run(
      `UPDATE trips SET 
        name = COALESCE($1, name), 
        date = COALESCE($2, date),
        status = COALESCE($3, status), 
        notes = COALESCE($4, notes),
        "updatedAt" = $5 
      WHERE id = $6`,
      [name || null, date || null, status || null, notes !== undefined ? notes : null, now, req.params.id]
    );

    const updated = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('Error updating trip:', err);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// DELETE /api/trips/:id — cascade deletes travelers + scan events
router.delete('/:id', async (req, res) => {
  try {
    const trip = await get('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // CASCADE handles travelers and scan_events deletion via FK
    await run('DELETE FROM trips WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: `Trip "${trip.name}" and all associated data deleted` });
  } catch (err) {
    console.error('Error deleting trip:', err);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

module.exports = router;
