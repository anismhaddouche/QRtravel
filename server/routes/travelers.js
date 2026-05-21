const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { isSuperAdmin, effectiveAgencyId } = require('../lib/scope');

const CSV_MAX_BYTES = 1024 * 1024; // 1 MB
const CSV_MAX_ROWS = 500;

// Parse a CSV text into { header, rows } with auto-detected separator
// (comma or semicolon), supporting quoted fields and CRLF/LF newlines.
function parseCsv(text) {
  if (typeof text !== 'string') return { header: [], rows: [] };
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  // Pick separator from first non-empty line
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const out = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); }
  // Drop trailing blank rows
  while (out.length && out[out.length - 1].every(c => (c || '').trim() === '')) out.pop();
  if (out.length === 0) return { header: [], rows: [], sep };
  const header = out[0].map(h => (h || '').trim().toLowerCase());
  const rows = out.slice(1);
  return { header, rows, sep };
}

function normalizeHeader(h) {
  // Accept common French/English header variants
  const map = {
    type: 'type',
    nom: 'nom', lastname: 'nom', 'last name': 'nom', name: 'nom',
    prenom: 'prenom', 'prénom': 'prenom', firstname: 'prenom', 'first name': 'prenom',
    tel: 'tel', telephone: 'tel', 'téléphone': 'tel', phone: 'tel',
    mail: 'mail', email: 'mail', courriel: 'mail',
  };
  return map[h] || h;
}

function generateUniqueRefCode(existing) {
  for (let i = 0; i < 50; i++) {
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `TRV-${rnd}`;
    if (!existing.has(code)) return code;
  }
  return `TRV-${uuidv4().slice(0, 8).toUpperCase()}`;
}

// Only two types are supported. Legacy values 'couple' / 'family' that
// may still exist in old databases are migrated to 'group' on startup
// (see db.js migrations) and are rejected by validateType.
const TYPES = ['person', 'group'];
const TYPE_ERROR = 'Type invalide. Valeurs acceptées : Individuel, Groupe';
const TRAVELER_STATUSES = ['not_checked_in', 'checked_in'];
const REF_CODE_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const MAX_NAME = 200;
const MAX_NOTES = 2000;
const MAX_PHONE = 30;
const MAX_EMAIL = 255;
const MIN_PEOPLE = 1;
const MAX_PEOPLE = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Maps a free-form CSV "type" cell to one of the internal TYPES.
const TYPE_ALIASES = {
  individuel: 'person', individual: 'person', person: 'person', personne: 'person', solo: 'person',
  groupe: 'group', group: 'group',
};
function mapType(raw) {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (TYPES.includes(k)) return k;
  return TYPE_ALIASES[k] || null;
}

function cleanStr(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

function validateRefCode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  return REF_CODE_RE.test(s) ? s : null;
}

function validateType(v, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) { const err = new Error('type is required'); err.statusCode = 400; throw err; }
    return null;
  }
  if (!TYPES.includes(v)) {
    const err = new Error(TYPE_ERROR);
    err.statusCode = 400; throw err;
  }
  return v;
}

function validateStatus(v) {
  if (v === undefined || v === null || v === '') return null;
  if (!TRAVELER_STATUSES.includes(v)) {
    const err = new Error(`status must be one of: ${TRAVELER_STATUSES.join(', ')}`);
    err.statusCode = 400; throw err;
  }
  return v;
}

function validatePhone(v, { throwOnError = true } = {}) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') {
    if (throwOnError) { const err = new Error('phone must be a string'); err.statusCode = 400; throw err; }
    return null;
  }
  const s = v.trim();
  if (!s) return null;
  if (s.length > MAX_PHONE) {
    if (throwOnError) { const err = new Error(`phone must be at most ${MAX_PHONE} characters`); err.statusCode = 400; throw err; }
    return null;
  }
  return s;
}

function validateEmail(v, { throwOnError = true } = {}) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') {
    if (throwOnError) { const err = new Error('email must be a string'); err.statusCode = 400; throw err; }
    return null;
  }
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.length > MAX_EMAIL || !EMAIL_RE.test(s)) {
    if (throwOnError) { const err = new Error('email is invalid'); err.statusCode = 400; throw err; }
    return null;
  }
  return s;
}

function validatePeopleCount(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_PEOPLE || n > MAX_PEOPLE) {
    const err = new Error(`peopleCount must be an integer between ${MIN_PEOPLE} and ${MAX_PEOPLE}`);
    err.statusCode = 400; throw err;
  }
  return n;
}

// Return trip if visible to user, else null.
async function fetchScopedTrip(user, tripId) {
  const trip = await get('SELECT * FROM trips WHERE id = $1', [tripId]);
  if (!trip) return null;
  if (!isSuperAdmin(user) && trip.agencyId !== effectiveAgencyId(user)) return null;
  return trip;
}

// Return traveler if visible to user, else null.
async function fetchScopedTraveler(user, travelerId) {
  const t = await get('SELECT * FROM travelers WHERE id = $1', [travelerId]);
  if (!t) return null;
  if (!isSuperAdmin(user) && t.agencyId !== effectiveAgencyId(user)) return null;
  return t;
}

router.get('/stats/summary', async (req, res) => {
  try {
    const tripId = req.query.tripId;
    if (!tripId) return res.status(400).json({ error: 'tripId query param is required', code: 'VALIDATION' });

    const trip = await fetchScopedTrip(req.user, tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

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
    console.error('Error fetching stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { tripId } = req.query;
    const superAdmin = isSuperAdmin(req.user);

    const where = [];
    const params = [];
    if (tripId) { params.push(tripId); where.push(`"tripId" = $${params.length}`); }
    if (superAdmin) {
      if (req.query.agencyId) { params.push(req.query.agencyId); where.push(`"agencyId" = $${params.length}`); }
    } else {
      params.push(effectiveAgencyId(req.user)); where.push(`"agencyId" = $${params.length}`);
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const travelers = await all(`SELECT * FROM travelers${whereSql} ORDER BY "referenceCode"`, params);
    res.json(travelers);
  } catch (err) {
    console.error('Error fetching travelers:', err.message);
    res.status(500).json({ error: 'Failed to fetch travelers' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const traveler = await fetchScopedTraveler(req.user, req.params.id);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });
    // Enrich with trip + agency name so the detail page doesn't have to do
    // extra round-trips. Scope was already enforced above.
    const enriched = await get(
      `SELECT t.*, tr.name AS "tripName", tr.date AS "tripDate", a.name AS "agencyName"
         FROM travelers t
         LEFT JOIN trips tr ON tr.id = t."tripId"
         LEFT JOIN agencies a ON a.id = t."agencyId"
        WHERE t.id = $1`,
      [req.params.id]
    );
    // Activity feed for this traveler. Scope is already enforced by
    // fetchScopedTraveler above; we filter scan_events on the same
    // referenceCode (and tripId for safety against legacy duplicates).
    const activity = await all(
      `SELECT id, action, timestamp, "deviceId", "tripId"
         FROM scan_events
        WHERE "referenceCode" = $1 AND "tripId" = $2
        ORDER BY timestamp DESC
        LIMIT 50`,
      [traveler.referenceCode, traveler.tripId]
    );
    res.json({ ...(enriched || traveler), activity });
  } catch (err) {
    console.error('[travelers.GET/:id] error', err && err.message);
    res.status(500).json({ error: 'Failed to fetch traveler' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const referenceCode = validateRefCode(body.referenceCode);
    const displayName = cleanStr(body.displayName, MAX_NAME);
    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';

    if (!referenceCode || !displayName || !tripId) {
      return res.status(400).json({
        error: 'referenceCode, displayName, type, and tripId are required',
        code: 'VALIDATION',
      });
    }

    const type = validateType(body.type, { required: true });
    const peopleCount = validatePeopleCount(body.peopleCount);
    const notes = body.notes === undefined ? '' : (cleanStr(body.notes, MAX_NOTES) || '');
    const phone = validatePhone(body.phone);
    const email = validateEmail(body.email);

    const trip = await fetchScopedTrip(req.user, tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const existing = await get('SELECT id FROM travelers WHERE "referenceCode" = $1', [referenceCode]);
    if (existing) {
      return res.status(409).json({ error: 'A traveler with this reference code already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    // Business rule: Individuel = 1 person, Groupe = at least 2.
    // Backend is the source of truth; client-supplied counts that
    // violate these are silently coerced rather than rejected so a
    // small UI glitch never blocks the user.
    const count = type === 'person'
      ? 1
      : Math.max(2, peopleCount ?? 2);

    await run(
      `INSERT INTO travelers (id, "referenceCode", "displayName", type, "peopleCount", notes, phone, email, "tripId", "agencyId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, referenceCode, displayName, type, count, notes, phone, email, tripId, trip.agencyId, now, now]
    );

    const traveler = await get('SELECT * FROM travelers WHERE id = $1', [id]);
    res.status(201).json(traveler);
  } catch (err) {
    if (err && err.statusCode === 400) return res.status(400).json({ error: err.message, code: 'VALIDATION' });
    // Unique violation on referenceCode
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Code de référence déjà utilisé', code: 'DUPLICATE_REFERENCE' });
    }
    console.error('[travelers.POST] DB error', {
      pgCode: err && err.code,
      constraint: err && err.constraint,
      column: err && err.column,
      message: err && err.message,
    });
    res.status(500).json({ error: 'Erreur base de données — vérifier les logs serveur', code: 'DB_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const traveler = await fetchScopedTraveler(req.user, req.params.id);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    const body = req.body || {};
    const displayName = body.displayName === undefined ? null : cleanStr(body.displayName, MAX_NAME);
    const type = validateType(body.type);
    let peopleCount = validatePeopleCount(body.peopleCount);
    // Effective type = incoming type or, if unchanged, the existing one.
    // Apply the same Individuel/Groupe count rules as POST.
    const effectiveType = type ?? traveler.type;
    if (effectiveType === 'person') {
      peopleCount = 1;
    } else if (effectiveType === 'group') {
      const base = peopleCount ?? traveler.peopleCount ?? 2;
      peopleCount = Math.max(2, base);
    }
    const status = validateStatus(body.status);
    const notes = body.notes === undefined ? null : (cleanStr(body.notes, MAX_NOTES) || '');
    // For phone/email, `undefined` = leave unchanged. Empty string = explicit clear.
    let phone;
    if (body.phone === undefined) phone = undefined;
    else if (body.phone === null || body.phone === '') phone = null;
    else phone = validatePhone(body.phone);
    let email;
    if (body.email === undefined) email = undefined;
    else if (body.email === null || body.email === '') email = null;
    else email = validateEmail(body.email);
    const now = new Date().toISOString();

    await run(
      `UPDATE travelers
       SET "displayName" = COALESCE($1, "displayName"),
           type = COALESCE($2, type),
           "peopleCount" = COALESCE($3, "peopleCount"),
           notes = COALESCE($4, notes),
           status = COALESCE($5, status),
           phone = CASE WHEN $7::boolean THEN $8 ELSE phone END,
           email = CASE WHEN $9::boolean THEN $10 ELSE email END,
           "updatedAt" = $6
       WHERE id = $11`,
      [
        displayName, type, peopleCount, notes, status, now,
        phone !== undefined, phone ?? null,
        email !== undefined, email ?? null,
        req.params.id,
      ]
    );

    const updated = await get('SELECT * FROM travelers WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    if (err && err.statusCode === 400) return res.status(400).json({ error: err.message, code: 'VALIDATION' });
    console.error('Error updating traveler:', err.message);
    res.status(500).json({ error: 'Failed to update traveler' });
  }
});

// ─── Bulk delete ───────────────────────────────────────────────────
// Body: { travelerIds: string[] }
// Returns: { deleted, skipped, errors: [{ id, reason }] }
// IDs outside the caller's tenant scope are silently skipped (never
// trusted from the client).
router.delete('/bulk', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const body = req.body || {};
    const ids = body.travelerIds;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'travelerIds must be an array', code: 'VALIDATION' });
    }
    if (ids.length === 0) {
      return res.status(400).json({ error: 'travelerIds must not be empty', code: 'VALIDATION' });
    }
    if (ids.length > 500) {
      return res.status(413).json({ error: 'Too many ids (max 500)', code: 'TOO_MANY_IDS' });
    }
    const cleanIds = [];
    for (const v of ids) {
      if (typeof v !== 'string') continue;
      const s = v.trim();
      if (s && s.length <= 128) cleanIds.push(s);
    }
    if (cleanIds.length === 0) {
      return res.status(400).json({ error: 'No valid ids', code: 'VALIDATION' });
    }

    const superAdmin = isSuperAdmin(req.user);
    // Build IN placeholder list
    const placeholders = cleanIds.map((_, i) => `$${i + 1}`).join(',');
    let scopedSql = `SELECT id, "referenceCode", "agencyId" FROM travelers WHERE id IN (${placeholders})`;
    const params = [...cleanIds];
    if (!superAdmin) {
      params.push(effectiveAgencyId(req.user));
      scopedSql += ` AND "agencyId" = $${params.length}`;
    }
    const visible = await all(scopedSql, params);
    const visibleIds = visible.map(t => t.id);
    const visibleRefs = visible.map(t => t.referenceCode);
    const skipped = cleanIds.length - visibleIds.length;

    if (visibleIds.length === 0) {
      return res.json({ deleted: 0, skipped, errors: [] });
    }

    // Delete scan_events for these reference codes, then travelers.
    if (visibleRefs.length > 0) {
      const refPh = visibleRefs.map((_, i) => `$${i + 1}`).join(',');
      await run(`DELETE FROM scan_events WHERE "referenceCode" IN (${refPh})`, visibleRefs);
    }
    const idPh = visibleIds.map((_, i) => `$${i + 1}`).join(',');
    await run(`DELETE FROM travelers WHERE id IN (${idPh})`, visibleIds);

    res.json({ deleted: visibleIds.length, skipped, errors: [] });
  } catch (err) {
    console.error('[travelers.bulk-delete] error', { pgCode: err && err.code, message: err && err.message });
    res.status(500).json({ error: 'Erreur base de données — vérifier les logs serveur', code: 'DB_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const traveler = await fetchScopedTraveler(req.user, req.params.id);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });
    await run('DELETE FROM scan_events WHERE "referenceCode" = $1', [traveler.referenceCode]);
    await run('DELETE FROM travelers WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: `${traveler.displayName} deleted` });
  } catch (err) {
    console.error('Error deleting traveler:', err.message);
    res.status(500).json({ error: 'Failed to delete traveler' });
  }
});

// ─── CSV import ────────────────────────────────────────────────────
// Accepts text/csv body up to 1 MB. Auth + tenant isolation enforced
// via fetchScopedTrip. Returns per-row errors instead of all-or-nothing.
router.post(
  '/import-csv',
  express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: CSV_MAX_BYTES }),
  async (req, res) => {
    try {
      const tripId = typeof req.query.tripId === 'string' ? req.query.tripId.trim() : '';
      if (!tripId) {
        return res.status(400).json({ error: 'tripId query param is required', code: 'VALIDATION' });
      }

      const text = typeof req.body === 'string' ? req.body : '';
      if (!text.trim()) {
        return res.status(400).json({ error: 'CSV body is empty', code: 'VALIDATION' });
      }

      const trip = await fetchScopedTrip(req.user, tripId);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });

      const { header, rows } = parseCsv(text);
      if (!header.length) {
        return res.status(400).json({ error: 'CSV header is missing', code: 'VALIDATION' });
      }
      const cols = header.map(normalizeHeader);
      const idx = {
        type: cols.indexOf('type'),
        nom: cols.indexOf('nom'),
        prenom: cols.indexOf('prenom'),
        tel: cols.indexOf('tel'),
        mail: cols.indexOf('mail'),
      };
      if (idx.nom === -1 || idx.prenom === -1) {
        return res.status(400).json({
          error: 'CSV must contain at least columns: nom, prenom (and ideally type, tel, mail)',
          code: 'VALIDATION',
        });
      }
      if (rows.length > CSV_MAX_ROWS) {
        return res.status(413).json({
          error: `CSV exceeds the maximum of ${CSV_MAX_ROWS} rows`,
          code: 'TOO_MANY_ROWS',
        });
      }

      // Preload existing referenceCodes for this agency to keep generation unique.
      const existingRows = await all(
        'SELECT "referenceCode" FROM travelers WHERE "agencyId" = $1',
        [trip.agencyId]
      );
      const usedRefs = new Set(existingRows.map(r => r.referenceCode));

      console.log('[travelers.import-csv] start', {
        tripId,
        userRole: req.user && req.user.role,
        userAgencyId: req.user && req.user.agencyId,
        tripAgencyId: trip.agencyId,
        rowsParsed: rows.length,
        sep: header && header.length ? (text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',') : 'n/a',
      });

      const errors = [];
      let created = 0;
      let firstDbError = null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNo = i + 2; // header is line 1
        // Skip fully empty rows silently
        if (row.every(c => (c || '').trim() === '')) continue;

        const rawType = idx.type >= 0 ? row[idx.type] : '';
        const nom = idx.nom >= 0 ? (row[idx.nom] || '').trim() : '';
        const prenom = idx.prenom >= 0 ? (row[idx.prenom] || '').trim() : '';
        const tel = idx.tel >= 0 ? (row[idx.tel] || '').trim() : '';
        const mail = idx.mail >= 0 ? (row[idx.mail] || '').trim() : '';

        if (!nom && !prenom) {
          errors.push({ line: lineNo, error: 'Nom manquant' });
          continue;
        }
        if (!nom) {
          errors.push({ line: lineNo, error: 'Nom manquant' });
          continue;
        }

        const displayName = (prenom ? `${prenom} ${nom}` : nom).slice(0, MAX_NAME);
        const type = rawType ? mapType(rawType) : 'person';
        if (!type) {
          errors.push({ line: lineNo, error: TYPE_ERROR });
          continue;
        }

        let phone = null;
        if (tel) {
          try { phone = validatePhone(tel); }
          catch { errors.push({ line: lineNo, error: 'Téléphone trop long' }); continue; }
        }
        let email = null;
        if (mail) {
          try { email = validateEmail(mail); }
          catch { errors.push({ line: lineNo, error: 'Email invalide' }); continue; }
        }

        const referenceCode = generateUniqueRefCode(usedRefs);
        usedRefs.add(referenceCode);

        const id = uuidv4();
        const now = new Date().toISOString();
        try {
          await run(
            `INSERT INTO travelers (id, "referenceCode", "displayName", type, "peopleCount", notes, phone, email, "tripId", "agencyId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [id, referenceCode, displayName, type, type === 'person' ? 1 : 2, '', phone, email, tripId, trip.agencyId, now, now]
          );
          created++;
        } catch (e) {
          if (!firstDbError) {
            firstDbError = { pgCode: e && e.code, constraint: e && e.constraint, column: e && e.column, message: e && e.message };
            console.error('[travelers.import-csv] insert failed', { line: lineNo, ...firstDbError });
          }
          let msg = 'Erreur base de données';
          if (e && e.code === '23505') msg = 'Code de référence déjà utilisé';
          else if (e && e.code === '42703') msg = 'Colonne manquante en base — migration requise';
          else if (e && e.code === '23502') msg = 'Champ requis manquant';
          else if (e && e.code === '23514') msg = 'Valeur invalide pour une contrainte';
          errors.push({ line: lineNo, error: msg });
        }
      }

      console.log('[travelers.import-csv] done', { created, failed: errors.length });
      res.json({ created, failed: errors.length, errors });
    } catch (err) {
      if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'CSV file too large (max 1 MB)', code: 'PAYLOAD_TOO_LARGE' });
      }
      console.error('Error importing CSV:', err.message);
      res.status(500).json({ error: 'Failed to import CSV' });
    }
  }
);

module.exports = router;
