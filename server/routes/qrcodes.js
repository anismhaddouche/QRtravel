const express = require('express');
const router = express.Router();
const { get, all } = require('../db');
const QRCode = require('qrcode');

// GET /api/qrcodes — get all QR codes as data URLs (for print/export page)
router.get('/', async (req, res) => {
  const tripId = req.query.tripId;
  if (!tripId) return res.status(400).json({ error: 'tripId query param is required' });
  const travelers = all('SELECT * FROM travelers WHERE tripId = ? ORDER BY referenceCode', [tripId]);

  try {
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
    res.status(500).json({ error: 'Failed to generate QR codes' });
  }
});

// GET /api/qrcodes/:referenceCode — generate a single QR code
router.get('/:referenceCode', async (req, res) => {
  const { referenceCode } = req.params;

  const traveler = get('SELECT * FROM travelers WHERE referenceCode = ?', [referenceCode]);
  if (!traveler) {
    return res.status(404).json({ error: `Unknown reference code: ${referenceCode}` });
  }

  try {
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
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

module.exports = router;
