const express = require('express');
const router = express.Router();
const { get, all } = require('../db');
const QRCode = require('qrcode');
const { isSuperAdmin, effectiveAgencyId } = require('../lib/scope');

function inUserScope(user, agencyId) {
  if (isSuperAdmin(user)) return true;
  return agencyId && agencyId === effectiveAgencyId(user);
}

// GET /api/qrcodes — all QR codes for a trip (agency-scoped)
router.get('/', async (req, res) => {
  try {
    const tripId = req.query.tripId;
    if (!tripId) return res.status(400).json({ error: 'tripId query param is required' });

    const trip = await get('SELECT id, "agencyId" FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!inUserScope(req.user, trip.agencyId)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
    }

    const travelers = await all('SELECT * FROM travelers WHERE "tripId" = $1 ORDER BY "referenceCode"', [tripId]);

    const qrCodes = await Promise.all(
      travelers.map(async (t) => {
        const dataUrl = await QRCode.toDataURL(t.referenceCode, { margin: 2, width: 200 });
        return {
          id: t.id,
          referenceCode: t.referenceCode,
          displayName: t.displayName,
          type: t.type,
          peopleCount: t.peopleCount,
          dataUrl
        };
      })
    );
    res.json(qrCodes);
  } catch (err) {
    console.error('Error generating QR codes:', err);
    res.status(500).json({ error: 'Failed to generate QR codes' });
  }
});

// GET /api/qrcodes/:referenceCode — single QR code (agency-scoped)
router.get('/:referenceCode', async (req, res) => {
  try {
    const { referenceCode } = req.params;

    const traveler = await get('SELECT * FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
    if (!traveler) {
      return res.status(404).json({ error: `Unknown reference code: ${referenceCode}` });
    }
    if (!inUserScope(req.user, traveler.agencyId)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN_AGENCY_SCOPE' });
    }

    const format = req.query.format || 'png';

    if (format === 'svg') {
      const svg = await QRCode.toString(referenceCode, { type: 'svg', margin: 2, width: 256 });
      res.type('image/svg+xml').send(svg);
    } else if (format === 'dataurl') {
      const dataUrl = await QRCode.toDataURL(referenceCode, { margin: 2, width: 256 });
      res.json({ referenceCode, displayName: traveler.displayName, dataUrl });
    } else {
      const buffer = await QRCode.toBuffer(referenceCode, { margin: 2, width: 256 });
      res.type('image/png').send(buffer);
    }
  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

module.exports = router;
