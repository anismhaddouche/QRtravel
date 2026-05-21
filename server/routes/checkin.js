const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { isSuperAdmin, effectiveAgencyId } = require('../lib/scope');

const REF_CODE_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const DEVICE_ID_MAX = 128;

const MAX_EVENTS_LIMIT = 200;
const MAX_SYNC_BATCH = 200;

function normalizeRefCode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  return REF_CODE_RE.test(s) ? s : null;
}

function normalizeId(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return ID_RE.test(s) ? s : null;
}

function normalizeDeviceId(raw, fallback = 'unknown') {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  return raw.slice(0, DEVICE_ID_MAX);
}

function badRequest(res, message, field) {
  return res.status(400).json({ error: message, code: 'VALIDATION', field: field || null });
}

// Enforce tenant scope: returns true if the user may operate on this trip+traveler.
function inUserScope(user, agencyId) {
  if (isSuperAdmin(user)) return true;
  return agencyId && agencyId === effectiveAgencyId(user);
}

function forbidScope(res) {
  return res.status(403).json({
    error: 'This resource belongs to another agency',
    code: 'FORBIDDEN_AGENCY_SCOPE',
  });
}

// POST /api/checkin — tripId REQUIRED.
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const referenceCode = normalizeRefCode(body.referenceCode);
    if (!referenceCode) return badRequest(res, 'referenceCode is required', 'referenceCode');

    const tripId = normalizeId(body.tripId);
    if (!tripId) return badRequest(res, 'tripId is required', 'tripId');

    const deviceId = normalizeDeviceId(body.deviceId);

    const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'UNKNOWN_TRIP' });
    if (!inUserScope(req.user, trip.agencyId)) return forbidScope(res);

    const traveler = await get('SELECT * FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
    if (!traveler) {
      return res.status(404).json({
        error: `Unknown QR code: ${referenceCode}`,
        code: 'UNKNOWN_CODE',
        referenceCode,
      });
    }
    if (!inUserScope(req.user, traveler.agencyId)) return forbidScope(res);

    if (traveler.tripId !== tripId) {
      return res.status(409).json({
        error: 'This code belongs to a different trip',
        code: 'WRONG_TRIP',
      });
    }

    if (traveler.status === 'checked_in') {
      return res.status(409).json({
        error: `${traveler.displayName} is already checked in`,
        code: 'ALREADY_CHECKED_IN',
        traveler,
      });
    }

    const now = new Date().toISOString();

    await run(
      `UPDATE travelers SET status = 'checked_in', "checkedInAt" = $1 WHERE id = $2`,
      [now, traveler.id]
    );

    const eventId = uuidv4();
    await run(
      `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId", "agencyId")
       VALUES ($1, $2, 'check_in', $3, $4, 1, $5, $6)`,
      [eventId, referenceCode, now, deviceId, traveler.tripId, traveler.agencyId]
    );

    const updatedTraveler = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);

    res.json({
      success: true,
      message: `${updatedTraveler.displayName} checked in successfully`,
      traveler: updatedTraveler,
      eventId,
    });
  } catch (err) {
    console.error('[CHECKIN] error:', err.message);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

router.post('/undo', async (req, res) => {
  try {
    const body = req.body || {};
    const referenceCode = normalizeRefCode(body.referenceCode);
    if (!referenceCode) return badRequest(res, 'referenceCode is required', 'referenceCode');

    const tripId = normalizeId(body.tripId);
    if (!tripId) return badRequest(res, 'tripId is required', 'tripId');

    const deviceId = normalizeDeviceId(body.deviceId);

    const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'UNKNOWN_TRIP' });
    if (!inUserScope(req.user, trip.agencyId)) return forbidScope(res);

    const traveler = await get('SELECT * FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
    if (!traveler) {
      return res.status(404).json({ error: `Unknown reference code: ${referenceCode}`, code: 'UNKNOWN_CODE' });
    }
    if (!inUserScope(req.user, traveler.agencyId)) return forbidScope(res);
    if (traveler.tripId !== tripId) {
      return res.status(409).json({ error: 'This code belongs to a different trip', code: 'WRONG_TRIP' });
    }
    if (traveler.status === 'not_checked_in') {
      return res.status(409).json({
        error: `${traveler.displayName} is not checked in`,
        code: 'NOT_CHECKED_IN',
        traveler,
      });
    }

    const now = new Date().toISOString();

    await run(`UPDATE travelers SET status = 'not_checked_in', "checkedInAt" = NULL WHERE id = $1`, [traveler.id]);

    const eventId = uuidv4();
    await run(
      `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId", "agencyId")
       VALUES ($1, $2, 'undo_check_in', $3, $4, 1, $5, $6)`,
      [eventId, referenceCode, now, deviceId, traveler.tripId, traveler.agencyId]
    );

    const updatedTraveler = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);

    res.json({
      success: true,
      message: `${updatedTraveler.displayName} check-in undone`,
      traveler: updatedTraveler,
      eventId,
    });
  } catch (err) {
    console.error('[CHECKIN] undo error:', err.message);
    res.status(500).json({ error: 'Undo check-in failed' });
  }
});

router.post('/manual', async (req, res) => {
  try {
    const body = req.body || {};
    const travelerId = normalizeId(body.travelerId);
    if (!travelerId) return badRequest(res, 'travelerId is required', 'travelerId');

    const tripId = normalizeId(body.tripId);
    if (!tripId) return badRequest(res, 'tripId is required', 'tripId');

    const deviceId = normalizeDeviceId(body.deviceId, 'manual');

    const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'UNKNOWN_TRIP' });
    if (!inUserScope(req.user, trip.agencyId)) return forbidScope(res);

    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [travelerId]);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }
    if (!inUserScope(req.user, traveler.agencyId)) return forbidScope(res);
    if (traveler.tripId !== tripId) {
      return res.status(409).json({ error: 'Traveler belongs to a different trip', code: 'WRONG_TRIP' });
    }
    if (traveler.status === 'checked_in') {
      return res.status(409).json({
        error: `${traveler.displayName} is already checked in`,
        code: 'ALREADY_CHECKED_IN',
        traveler,
      });
    }

    const now = new Date().toISOString();

    await run(`UPDATE travelers SET status = 'checked_in', "checkedInAt" = $1 WHERE id = $2`, [now, traveler.id]);

    const eventId = uuidv4();
    await run(
      `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId", "agencyId")
       VALUES ($1, $2, 'check_in', $3, $4, 1, $5, $6)`,
      [eventId, traveler.referenceCode, now, deviceId, traveler.tripId, traveler.agencyId]
    );

    const updatedTraveler = await get('SELECT * FROM travelers WHERE id = $1', [traveler.id]);

    res.json({
      success: true,
      message: `${updatedTraveler.displayName} manually checked in`,
      traveler: updatedTraveler,
    });
  } catch (err) {
    console.error('[CHECKIN] manual error:', err.message);
    res.status(500).json({ error: 'Manual check-in failed' });
  }
});

// Shared helper for bulk check-in / undo. `action` is 'check_in' or
// 'undo_check_in'. Tenant scope and current-status checks decide
// whether each traveler is updated or silently skipped — the response
// reports both counts so the UI can show "3 updated, 1 ignored".
async function bulkSetStatus(req, res, action) {
  try {
    const body = req.body || {};
    const tripId = normalizeId(body.tripId);
    if (!tripId) return badRequest(res, 'tripId is required', 'tripId');

    const ids = Array.isArray(body.travelerIds) ? body.travelerIds : null;
    if (!ids) return badRequest(res, 'travelerIds must be an array', 'travelerIds');
    if (ids.length === 0) return badRequest(res, 'travelerIds must not be empty', 'travelerIds');
    if (ids.length > 500) return res.status(413).json({ error: 'Too many ids (max 500)', code: 'TOO_MANY_IDS' });

    const cleanIds = [];
    for (const v of ids) {
      const s = normalizeId(v);
      if (s) cleanIds.push(s);
    }
    if (cleanIds.length === 0) return badRequest(res, 'No valid ids', 'travelerIds');

    const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'UNKNOWN_TRIP' });
    if (!inUserScope(req.user, trip.agencyId)) return forbidScope(res);

    // Fetch all candidate travelers in scope (same trip, same agency).
    const placeholders = cleanIds.map((_, i) => `$${i + 1}`).join(',');
    const params = [...cleanIds, tripId];
    let sql = `SELECT id, "referenceCode", status, "agencyId", "tripId"
                 FROM travelers
                WHERE id IN (${placeholders})
                  AND "tripId" = $${params.length}`;
    if (!isSuperAdmin(req.user)) {
      params.push(effectiveAgencyId(req.user));
      sql += ` AND "agencyId" = $${params.length}`;
    }
    const visible = await all(sql, params);

    const targetStatus = action === 'check_in' ? 'checked_in' : 'not_checked_in';
    const fromStatus   = action === 'check_in' ? 'not_checked_in' : 'checked_in';
    const toUpdate = visible.filter(t => t.status === fromStatus);
    const skipped = cleanIds.length - toUpdate.length;

    if (toUpdate.length === 0) {
      return res.json({ updated: 0, skipped, errors: [] });
    }

    const now = new Date().toISOString();
    const updateIds = toUpdate.map(t => t.id);
    const updPlaceholders = updateIds.map((_, i) => `$${i + 1}`).join(',');

    if (action === 'check_in') {
      await run(
        `UPDATE travelers SET status = 'checked_in', "checkedInAt" = $${updateIds.length + 1}
          WHERE id IN (${updPlaceholders})`,
        [...updateIds, now]
      );
    } else {
      await run(
        `UPDATE travelers SET status = 'not_checked_in', "checkedInAt" = NULL
          WHERE id IN (${updPlaceholders})`,
        updateIds
      );
    }

    // One scan_event per traveler so the activity feed reflects the bulk action.
    const deviceId = normalizeDeviceId(body.deviceId, action === 'check_in' ? 'manual-bulk' : 'undo-bulk');
    for (const t of toUpdate) {
      try {
        await run(
          `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId", "agencyId")
           VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
          [uuidv4(), t.referenceCode, action, now, deviceId, t.tripId, t.agencyId]
        );
      } catch (e) {
        // Don't fail the whole batch on a single event-insert error.
        console.error('[CHECKIN.bulk] event insert failed', { ref: t.referenceCode, msg: e.message });
      }
    }

    res.json({ updated: toUpdate.length, skipped, errors: [], targetStatus });
  } catch (err) {
    console.error(`[CHECKIN.bulk:${action}] error`, err.message);
    res.status(500).json({ error: 'Bulk check-in failed' });
  }
}

// POST /api/checkin/manual/bulk { tripId, travelerIds[] }
// Marks every selected not_checked_in traveler as checked_in. Already
// checked-in travelers and cross-tenant ids are silently skipped.
router.post('/manual/bulk', (req, res) => bulkSetStatus(req, res, 'check_in'));

// POST /api/checkin/undo/bulk { tripId, travelerIds[] }
// Reverses the previous endpoint.
router.post('/undo/bulk', (req, res) => bulkSetStatus(req, res, 'undo_check_in'));

router.get('/events', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_EVENTS_LIMIT)
      : 20;
    const tripId = req.query.tripId ? normalizeId(req.query.tripId) : null;
    const superAdmin = isSuperAdmin(req.user);

    const where = [];
    const params = [];
    if (tripId) {
      // Validate scope on trip lookup
      const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
      if (!trip) return res.json([]);
      if (!inUserScope(req.user, trip.agencyId)) return res.json([]);
      params.push(tripId); where.push(`"tripId" = $${params.length}`);
    }
    if (superAdmin) {
      if (req.query.agencyId) { params.push(req.query.agencyId); where.push(`"agencyId" = $${params.length}`); }
    } else {
      params.push(effectiveAgencyId(req.user)); where.push(`"agencyId" = $${params.length}`);
    }
    params.push(limit);
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const events = await all(
      `SELECT * FROM scan_events${whereSql} ORDER BY timestamp DESC LIMIT $${params.length}`,
      params
    );
    res.json(events);
  } catch (err) {
    console.error('[CHECKIN] events error:', err.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/checkin/sync — tripId REQUIRED at both batch and per-event level.
router.post('/sync', async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return badRequest(res, 'events array is required', 'events');
    }
    if (body.events.length > MAX_SYNC_BATCH) {
      return res.status(413).json({
        error: `Sync batch too large (max ${MAX_SYNC_BATCH})`,
        code: 'BATCH_TOO_LARGE',
      });
    }
    const tripId = normalizeId(body.tripId);
    if (!tripId) return badRequest(res, 'tripId is required', 'tripId');

    const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found', code: 'UNKNOWN_TRIP' });
    if (!inUserScope(req.user, trip.agencyId)) return forbidScope(res);

    const results = [];

    for (const raw of body.events) {
      const referenceCode = normalizeRefCode(raw?.referenceCode);
      const action = raw?.action;
      const timestamp = typeof raw?.timestamp === 'string' ? raw.timestamp : null;
      const deviceId = normalizeDeviceId(raw?.deviceId, 'offline');
      const eventId = normalizeId(raw?.eventId);
      const eventTripId = normalizeId(raw?.tripId);

      if (!referenceCode || !eventId || !timestamp || !eventTripId) {
        results.push({ eventId: eventId || null, status: 'error', message: 'Invalid event payload' });
        continue;
      }
      if (eventTripId !== tripId) {
        results.push({ eventId, status: 'error', message: 'Event tripId mismatch' });
        continue;
      }
      if (action !== 'check_in' && action !== 'undo_check_in') {
        results.push({ eventId, status: 'error', message: 'Invalid action' });
        continue;
      }

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
      if (!inUserScope(req.user, traveler.agencyId)) {
        results.push({ eventId, status: 'error', message: 'Forbidden agency scope' });
        continue;
      }
      if (traveler.tripId !== tripId) {
        results.push({ eventId, status: 'error', message: 'Wrong trip' });
        continue;
      }

      if (action === 'check_in') {
        if (traveler.status === 'checked_in') {
          results.push({ eventId, status: 'skipped', message: 'Already checked in' });
        } else {
          await run(
            `UPDATE travelers SET status = 'checked_in', "checkedInAt" = $1 WHERE id = $2`,
            [timestamp, traveler.id]
          );
          await run(
            `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId", "agencyId")
             VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
            [eventId, referenceCode, action, timestamp, deviceId, traveler.tripId, traveler.agencyId]
          );
          results.push({ eventId, status: 'success', message: `${traveler.displayName} checked in` });
        }
      } else {
        await run(
          `UPDATE travelers SET status = 'not_checked_in', "checkedInAt" = NULL WHERE id = $1`,
          [traveler.id]
        );
        await run(
          `INSERT INTO scan_events (id, "referenceCode", action, timestamp, "deviceId", synced, "tripId", "agencyId")
           VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
          [eventId, referenceCode, action, timestamp, deviceId, traveler.tripId, traveler.agencyId]
        );
        results.push({ eventId, status: 'success', message: `${traveler.displayName} check-in undone` });
      }
    }

    res.json({ synced: results.length, results });
  } catch (err) {
    console.error('[CHECKIN] sync error:', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
