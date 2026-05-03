const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, run } = require('../db');

// Admin credentials from environment
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ADMIN';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ADMIN123';

// Session duration: 24 hours
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

// Login request timeout — fail fast instead of hanging
const LOGIN_TIMEOUT_MS = 15000;

// Lazily hash the password once and cache it per instance
let cachedPasswordHash = null;
async function getPasswordHash() {
  if (cachedPasswordHash) return cachedPasswordHash;
  if (process.env.ADMIN_PASSWORD_HASH) {
    cachedPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  } else {
    cachedPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  }
  return cachedPasswordHash;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  // Fail-fast timeout — return JSON error instead of hanging
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('[AUTH] ❌ Login timed out after', LOGIN_TIMEOUT_MS, 'ms');
      res.status(504).json({
        error: 'Login request timed out. The database may be temporarily unavailable.',
        code: 'LOGIN_TIMEOUT',
      });
    }
  }, LOGIN_TIMEOUT_MS);

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Validate username first (no DB needed)
    if (username.toUpperCase() !== ADMIN_USERNAME.toUpperCase()) {
      clearTimeout(timeout);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hash = await getPasswordHash();
    const valid = await bcrypt.compare(password, hash);

    if (!valid) {
      clearTimeout(timeout);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session in DB
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await run(
      `INSERT INTO sessions (id, username, "createdAt", "expiresAt") VALUES ($1, $2, $3, $4)`,
      [sessionId, ADMIN_USERNAME, now.toISOString(), expiresAt.toISOString()]
    );

    clearTimeout(timeout);

    // Don't send if timeout already fired
    if (res.headersSent) return;

    // Set HttpOnly cookie
    res.cookie('qr_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: SESSION_DURATION_MS,
      path: '/',
    });

    console.log(`[AUTH] ✅ Login successful for user: ${ADMIN_USERNAME}`);
    res.json({ success: true, username: ADMIN_USERNAME });

  } catch (err) {
    clearTimeout(timeout);
    if (res.headersSent) return;

    console.error('[AUTH] ❌ Login error:', err.message);
    res.status(500).json({
      error: 'Database error during login. Please try again.',
      code: 'LOGIN_DB_ERROR',
    });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const sessionId = req.cookies?.qr_session;
    if (sessionId) {
      await run(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    }
  } catch (err) {
    console.error('[AUTH] Logout DB error (non-fatal):', err.message);
  }
  res.clearCookie('qr_session', { path: '/' });
  res.json({ success: true });
});

// GET /api/auth/me — check current session
router.get('/me', async (req, res) => {
  try {
    const sessionId = req.cookies?.qr_session;
    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = await get(
      `SELECT * FROM sessions WHERE id = $1 AND "expiresAt" > $2`,
      [sessionId, new Date().toISOString()]
    );

    if (!session) {
      res.clearCookie('qr_session', { path: '/' });
      return res.status(401).json({ error: 'Session expired' });
    }

    res.json({ username: session.username });

  } catch (err) {
    console.error('[AUTH] /me error:', err.message);
    // Return 401 rather than 500 — the frontend should show login
    res.clearCookie('qr_session', { path: '/' });
    res.status(401).json({ error: 'Authentication check failed. Please log in again.' });
  }
});

// Clean up expired sessions — only in long-running server mode (not serverless)
if (process.env.NODE_ENV !== 'production') {
  async function cleanExpiredSessions() {
    try {
      await run(`DELETE FROM sessions WHERE "expiresAt" < $1`, [new Date().toISOString()]);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  setInterval(cleanExpiredSessions, 30 * 60 * 1000);
}

module.exports = router;
