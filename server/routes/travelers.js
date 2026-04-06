const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/travelers/stats/summary — dashboard stats (MUST come before /:id)
router.get('/stats/summary', (req, res) => {
  const tripId = req.query.tripId;
  if (!tripId) return res.status(400).json({ error: 'tripId query param is required' });

  const total = get('SELECT COUNT(*) as count FROM travelers WHERE tripId = ?', [tripId]);
  const checkedIn = get("SELECT COUNT(*) as count FROM travelers WHERE tripId = ? AND status = 'checked_in'", [tripId]);
  const totalPeople = get('SELECT COALESCE(SUM(peopleCount), 0) as count FROM travelers WHERE tripId = ?', [tripId]);
  const checkedInPeople = get("SELECT COALESCE(SUM(peopleCount), 0) as count FROM travelers WHERE tripId = ? AND status = 'checked_in'", [tripId]);

  res.json({
    totalUnits: total.count,
    checkedInUnits: checkedIn.count,
    missingUnits: total.count - checkedIn.count,
    totalPeople: totalPeople.count,
    checkedInPeople: checkedInPeople.count,
    missingPeople: totalPeople.count - checkedInPeople.count,
  });
});

// GET /api/travelers — list all travelers (requires tripId)
router.get('/', (req, res) => {
  const { tripId } = req.query;
  let travelers;
  if (tripId) {
    travelers = all('SELECT * FROM travelers WHERE tripId = ? ORDER BY referenceCode', [tripId]);
  } else {
    travelers = all('SELECT * FROM travelers ORDER BY referenceCode');
  }
  res.json(travelers);
});

// GET /api/travelers/:id
router.get('/:id', (req, res) => {
  const traveler = get('SELECT * FROM travelers WHERE id = ?', [req.params.id]);
  if (!traveler) return res.status(404).json({ error: 'Traveler not found' });
  res.json(traveler);
});

// POST /api/travelers — create a new traveler unit
router.post('/', (req, res) => {
  const { referenceCode, displayName, type, peopleCount, notes, tripId } = req.body;

  if (!referenceCode || !displayName || !type || !tripId) {
    return res.status(400).json({ error: 'referenceCode, displayName, type, and tripId are required' });
  }

  if (!['person', 'couple', 'family', 'group'].includes(type)) {
    return res.status(400).json({ error: 'type must be person, couple, family, or group' });
  }

  // Verify trip exists
  const trip = get('SELECT id FROM trips WHERE id = ?', [tripId]);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const existing = get('SELECT id FROM travelers WHERE referenceCode = ?', [referenceCode]);
  if (existing) {
    return res.status(409).json({ error: 'A traveler with this reference code already exists' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const count = peopleCount || (type === 'person' ? 1 : type === 'couple' ? 2 : 3);

  run(
    `INSERT INTO travelers (id, referenceCode, displayName, type, peopleCount, notes, tripId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, referenceCode, displayName, type, count, notes || '', tripId, now, now]
  );

  const traveler = get('SELECT * FROM travelers WHERE id = ?', [id]);
  res.status(201).json(traveler);
});

// PUT /api/travelers/:id — update a traveler unit
router.put('/:id', (req, res) => {
  const traveler = get('SELECT * FROM travelers WHERE id = ?', [req.params.id]);
  if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

  const { displayName, type, peopleCount, notes, status } = req.body;
  const now = new Date().toISOString();

  run(
    `UPDATE travelers 
     SET displayName = COALESCE(?, displayName),
         type = COALESCE(?, type),
         peopleCount = COALESCE(?, peopleCount),
         notes = COALESCE(?, notes),
         status = COALESCE(?, status),
         updatedAt = ?
     WHERE id = ?`,
    [displayName || null, type || null, peopleCount || null, notes !== undefined ? notes : null, status || null, now, req.params.id]
  );

  const updated = get('SELECT * FROM travelers WHERE id = ?', [req.params.id]);
  res.json(updated);
});

// DELETE /api/travelers/:id
router.delete('/:id', (req, res) => {
  const traveler = get('SELECT * FROM travelers WHERE id = ?', [req.params.id]);
  if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

  run('DELETE FROM travelers WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: `${traveler.displayName} deleted` });
});

module.exports = router;
