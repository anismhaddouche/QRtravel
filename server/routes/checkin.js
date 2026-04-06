const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { broadcast } = require('../websocket');

// POST /api/checkin — check in a traveler by referenceCode
router.post('/', (req, res) => {
  const { referenceCode, deviceId } = req.body;

  if (!referenceCode) {
    return res.status(400).json({ error: 'referenceCode is required', code: 'MISSING_CODE' });
  }

  const traveler = get('SELECT * FROM travelers WHERE referenceCode = ?', [referenceCode]);

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

  run("UPDATE travelers SET status = 'checked_in', checkedInAt = ? WHERE id = ?", [now, traveler.id]);

  const eventId = uuidv4();
  run(
    `INSERT INTO scan_events (id, referenceCode, action, timestamp, deviceId, synced)
     VALUES (?, ?, 'check_in', ?, ?, 1)`,
    [eventId, referenceCode, now, deviceId || 'unknown']
  );

  const updatedTraveler = get('SELECT * FROM travelers WHERE id = ?', [traveler.id]);

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
});

// POST /api/checkin/undo — undo a check-in
router.post('/undo', (req, res) => {
  const { referenceCode, deviceId } = req.body;

  if (!referenceCode) {
    return res.status(400).json({ error: 'referenceCode is required' });
  }

  const traveler = get('SELECT * FROM travelers WHERE referenceCode = ?', [referenceCode]);

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

  run("UPDATE travelers SET status = 'not_checked_in', checkedInAt = NULL WHERE id = ?", [traveler.id]);

  const eventId = uuidv4();
  run(
    `INSERT INTO scan_events (id, referenceCode, action, timestamp, deviceId, synced)
     VALUES (?, ?, 'undo_check_in', ?, ?, 1)`,
    [eventId, referenceCode, now, deviceId || 'unknown']
  );

  const updatedTraveler = get('SELECT * FROM travelers WHERE id = ?', [traveler.id]);

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
});

// POST /api/checkin/manual — manual check-in without scanning
router.post('/manual', (req, res) => {
  const { travelerId, deviceId } = req.body;

  if (!travelerId) {
    return res.status(400).json({ error: 'travelerId is required' });
  }

  const traveler = get('SELECT * FROM travelers WHERE id = ?', [travelerId]);

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

  run("UPDATE travelers SET status = 'checked_in', checkedInAt = ? WHERE id = ?", [now, traveler.id]);

  const eventId = uuidv4();
  run(
    `INSERT INTO scan_events (id, referenceCode, action, timestamp, deviceId, synced)
     VALUES (?, ?, 'check_in', ?, ?, 1)`,
    [eventId, traveler.referenceCode, now, deviceId || 'manual']
  );

  const updatedTraveler = get('SELECT * FROM travelers WHERE id = ?', [traveler.id]);

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
});

// GET /api/checkin/events — recent scan events
router.get('/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const events = all('SELECT * FROM scan_events ORDER BY timestamp DESC LIMIT ?', [limit]);
  res.json(events);
});

// POST /api/checkin/sync — receive queued offline events
router.post('/sync', (req, res) => {
  const { events } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events array is required' });
  }

  const results = [];

  for (const event of events) {
    const { referenceCode, action, timestamp, deviceId, eventId } = event;

    // Deduplicate by eventId
    const existing = get('SELECT id FROM scan_events WHERE id = ?', [eventId]);
    if (existing) {
      results.push({ eventId, status: 'duplicate', message: 'Event already processed' });
      continue;
    }

    const traveler = get('SELECT * FROM travelers WHERE referenceCode = ?', [referenceCode]);
    if (!traveler) {
      results.push({ eventId, status: 'error', message: `Unknown code: ${referenceCode}` });
      continue;
    }

    if (action === 'check_in') {
      if (traveler.status === 'checked_in') {
        results.push({ eventId, status: 'skipped', message: 'Already checked in' });
      } else {
        run("UPDATE travelers SET status = 'checked_in', checkedInAt = ? WHERE id = ?", [timestamp, traveler.id]);
        run(
          `INSERT INTO scan_events (id, referenceCode, action, timestamp, deviceId, synced) VALUES (?, ?, ?, ?, ?, 1)`,
          [eventId, referenceCode, action, timestamp, deviceId || 'offline']
        );
        const updated = get('SELECT * FROM travelers WHERE id = ?', [traveler.id]);
        broadcast({ type: 'check_in', traveler: updated, timestamp, eventId });
        results.push({ eventId, status: 'success', message: `${traveler.displayName} checked in` });
      }
    } else if (action === 'undo_check_in') {
      run("UPDATE travelers SET status = 'not_checked_in', checkedInAt = NULL WHERE id = ?", [traveler.id]);
      run(
        `INSERT INTO scan_events (id, referenceCode, action, timestamp, deviceId, synced) VALUES (?, ?, ?, ?, ?, 1)`,
        [eventId, referenceCode, action, timestamp, deviceId || 'offline']
      );
      const updated = get('SELECT * FROM travelers WHERE id = ?', [traveler.id]);
      broadcast({ type: 'undo_check_in', traveler: updated, timestamp, eventId });
      results.push({ eventId, status: 'success', message: `${traveler.displayName} check-in undone` });
    }
  }

  res.json({ synced: results.length, results });
});

module.exports = router;
