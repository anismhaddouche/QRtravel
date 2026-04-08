const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');

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
    const { referenceCode, displayName, type, peopleCount, notes, tripId } = req.body;

    if (!referenceCode || !displayName || !type || !tripId) {
      return res.status(400).json({ error: 'referenceCode, displayName, type, and tripId are required' });
    }

    if (!['person', 'couple', 'family', 'group'].includes(type)) {
      return res.status(400).json({ error: 'type must be person, couple, family, or group' });
    }

    // Verify trip exists
    const trip = await get('SELECT id FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const existing = await get('SELECT id FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
    if (existing) {
      return res.status(409).json({ error: 'A traveler with this reference code already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const count = peopleCount || (type === 'person' ? 1 : type === 'couple' ? 2 : 3);

    await run(
      `INSERT INTO travelers (id, "referenceCode", "displayName", type, "peopleCount", notes, "tripId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, referenceCode, displayName, type, count, notes || '', tripId, now, now]
    );

    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [id]);
    res.status(201).json(traveler);
  } catch (err) {
    console.error('Error creating traveler:', err);
    res.status(500).json({ error: 'Failed to create traveler' });
  }
});

// PUT /api/travelers/:id — update a traveler unit
router.put('/:id', async (req, res) => {
  try {
    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    const { displayName, type, peopleCount, notes, status } = req.body;
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
      [displayName || null, type || null, peopleCount || null, notes !== undefined ? notes : null, status || null, now, req.params.id]
    );

    const updated = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('Error updating traveler:', err);
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
