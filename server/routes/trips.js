const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/trips — list all trips
router.get('/', (req, res) => {
  const { status } = req.query;
  let trips;
  if (status) {
    trips = all('SELECT * FROM trips WHERE status = ? ORDER BY date DESC', [status]);
  } else {
    trips = all('SELECT * FROM trips ORDER BY date DESC');
  }

  // Attach stats to each trip
  const enriched = trips.map(trip => {
    const total = get('SELECT COUNT(*) as count FROM travelers WHERE tripId = ?', [trip.id]);
    const checkedIn = get("SELECT COUNT(*) as count FROM travelers WHERE tripId = ? AND status = 'checked_in'", [trip.id]);
    const totalPeople = get('SELECT COALESCE(SUM(peopleCount), 0) as count FROM travelers WHERE tripId = ?', [trip.id]);
    return {
      ...trip,
      travelerCount: total.count,
      checkedInCount: checkedIn.count,
      totalPeople: totalPeople.count,
    };
  });

  res.json(enriched);
});

// GET /api/trips/:id
router.get('/:id', (req, res) => {
  const trip = get('SELECT * FROM trips WHERE id = ?', [req.params.id]);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

// POST /api/trips — create a new trip
router.post('/', (req, res) => {
  const { name, date } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    'INSERT INTO trips (id, name, date, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, date || now.split('T')[0], 'active', now, now]
  );

  const trip = get('SELECT * FROM trips WHERE id = ?', [id]);
  res.status(201).json(trip);
});

// PUT /api/trips/:id
router.put('/:id', (req, res) => {
  const trip = get('SELECT * FROM trips WHERE id = ?', [req.params.id]);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const { name, date, status } = req.body;
  const now = new Date().toISOString();

  run(
    `UPDATE trips SET name = COALESCE(?, name), date = COALESCE(?, date),
     status = COALESCE(?, status), updatedAt = ? WHERE id = ?`,
    [name || null, date || null, status || null, now, req.params.id]
  );

  const updated = get('SELECT * FROM trips WHERE id = ?', [req.params.id]);
  res.json(updated);
});

module.exports = router;
