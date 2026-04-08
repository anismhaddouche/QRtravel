const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { broadcast } = require('../websocket');

// POST /api/checkin — check in a traveler by referenceCode
router.post('/', async (req, res) => {
  try {
    const { referenceCode, deviceId } = req.body;

    if (!referenceCode) {
      return res.status(400).json({ error: 'referenceCode is required', code: 'MISSING_CODE' });
    }

    const traveler = await get('SELECT * FROM travelers WHERE "referenceCode" = $1', [referenceCode]);

    if (!traveler) {
      return res.status(404).json({
        error: `Unknown QR code: ${referenceCode}`,
        code: 'UNKNOWN_CODE',
        referenceCode
      });
    }

    if (traveler.status === 'checked_in') {
      return res.status(409).json({
        error: `${traveler.displayName} is already checked in`,
        code: 'ALREADY_CHECKED_IN',
        traveler
      });
    }

    const now = new Date().toISOString();

    await run(`UPDATE travelers SET status = 'checked_in', "checkedInAt" = $1 WHERE id = $2`, [now, traveler.id]);

    const eventId = uuidv4();
    await run(
      `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId")
       VALUES ($1, $2, 'check_in', $3, $4, 1, $5)`,
      [eventId, referenceCode, now, deviceId || 'unknown', traveler.tripId]
    );

    const updatedTraveler = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);

    broadcast({
      type: 'check_in',
      traveler: updatedTraveler,
      timestamp: now,
      eventId
    });

    res.json({
      success: true,
      message: `${updatedTraveler.displayName} checked in successfully`,
      traveler: updatedTraveler,
      eventId
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// POST /api/checkin/undo — undo a check-in
router.post('/undo', async (req, res) => {
  try {
    const { referenceCode, deviceId } = req.body;

    if (!referenceCode) {
      return res.status(400).json({ error: 'referenceCode is required' });
    }

    const traveler = await get('SELECT * FROM travelers WHERE "referenceCode" = $1', [referenceCode]);

    if (!traveler) {
      return res.status(404).json({ error: `Unknown reference code: ${referenceCode}`, code: 'UNKNOWN_CODE' });
    }

    if (traveler.status === 'not_checked_in') {
      return res.status(409).json({
        error: `${traveler.displayName} is not checked in`,
        code: 'NOT_CHECKED_IN',
        traveler
      });
    }

    const now = new Date().toISOString();

    await run(`UPDATE travelers SET status = 'not_checked_in', "checkedInAt" = NULL WHERE id = $1`, [traveler.id]);

    const eventId = uuidv4();
    await run(
      `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId")
       VALUES ($1, $2, 'undo_check_in', $3, $4, 1, $5)`,
      [eventId, referenceCode, now, deviceId || 'unknown', traveler.tripId]
    );

    const updatedTraveler = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);

    broadcast({
      type: 'undo_check_in',
      traveler: updatedTraveler,
      timestamp: now,
      eventId
    });

    res.json({
      success: true,
      message: `${updatedTraveler.displayName} check-in undone`,
      traveler: updatedTraveler,
      eventId
    });
  } catch (err) {
    console.error('Undo check-in error:', err);
    res.status(500).json({ error: 'Undo check-in failed' });
  }
});

// POST /api/checkin/manual — manual check-in without scanning
router.post('/manual', async (req, res) => {
  try {
    const { travelerId, deviceId } = req.body;

    if (!travelerId) {
      return res.status(400).json({ error: 'travelerId is required' });
    }

    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [travelerId]);

    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status === 'checked_in') {
      return res.status(409).json({
        error: `${traveler.displayName} is already checked in`,
        code: 'ALREADY_CHECKED_IN',
        traveler
      });
    }

    const now = new Date().toISOString();

    await run(`UPDATE travelers SET status = 'checked_in', "checkedInAt" = $1 WHERE id = $2`, [now, traveler.id]);

    const eventId = uuidv4();
    await run(
      `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId")
       VALUES ($1, $2, 'check_in', $3, $4, 1, $5)`,
      [eventId, traveler.referenceCode, now, deviceId || 'manual', traveler.tripId]
    );

    const updatedTraveler = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);

    broadcast({
      type: 'check_in',
      traveler: updatedTraveler,
      timestamp: now,
      eventId
    });

    res.json({
      success: true,
      message: `${updatedTraveler.displayName} manually checked in`,
      traveler: updatedTraveler
    });
  } catch (err) {
    console.error('Manual check-in error:', err);
    res.status(500).json({ error: 'Manual check-in failed' });
  }
});

// GET /api/checkin/events — recent scan events
router.get('/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const tripId = req.query.tripId;
    let events;
    if (tripId) {
      events = await all('SELECT * FROM scan_events WHERE "tripId" = $1 ORDER BY timestamp DESC LIMIT $2', [tripId, limit]);
    } else {
      events = await all('SELECT * FROM scan_events ORDER BY timestamp DESC LIMIT $1', [limit]);
    }
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/checkin/sync — receive queued offline events
router.post('/sync', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required' });
    }

    const results = [];

    for (const event of events) {
      const { referenceCode, action, timestamp, deviceId, eventId } = event;

      // Deduplicate by eventId
      const existing = await get('SELECT id FROM scan_events WHERE id = $1', [eventId]);
      if (existing) {
        results.push({ eventId, status: 'duplicate', message: 'Event already processed' });
        continue;
      }

      const traveler = await get('SELECT * FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
      if (!traveler) {
        results.push({ eventId, status: 'error', message: `Unknown code: ${referenceCode}` });
        continue;
      }

      if (action === 'check_in') {
        if (traveler.status === 'checked_in') {
          results.push({ eventId, status: 'skipped', message: 'Already checked in' });
        } else {
          await run(`UPDATE travelers SET status = 'checked_in', "checkedInAt" = $1 WHERE id = $2`, [timestamp, traveler.id]);
          await run(
            `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId") VALUES ($1, $2, $3, $4, $5, 1, $6)`,
            [eventId, referenceCode, action, timestamp, deviceId || 'offline', traveler.tripId]
          );
          const updated = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);
          broadcast({ type: 'check_in', traveler: updated, timestamp, eventId });
          results.push({ eventId, status: 'success', message: `${traveler.displayName} checked in` });
        }
      } else if (action === 'undo_check_in') {
        await run(`UPDATE travelers SET status = 'not_checked_in', "checkedInAt" = NULL WHERE id = $1`, [traveler.id]);
        await run(
          `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId") VALUES ($1, $2, $3, $4, $5, 1, $6)`,
          [eventId, referenceCode, action, timestamp, deviceId || 'offline', traveler.tripId]
        );
        const updated = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);
        broadcast({ type: 'undo_check_in', traveler: updated, timestamp, eventId });
        results.push({ eventId, status: 'success', message: `${traveler.displayName} check-in undone` });
      }
    }

    res.json({ synced: results.length, results });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
