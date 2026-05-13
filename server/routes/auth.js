const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, run } = require('../db');
const { createRateLimiter } = require('../middleware/rateLimit');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ADMIN';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ADMIN123';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 15000;

// Brute-force protection on /login (per IP).
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'login',
  message: 'Trop de tentatives de connexion. Réessayez plus tard.',
});

// Lighter cap on /me (polled on page load / app revival).
const meLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'me',
  message: 'Too many requests',
});

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

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // Frontend + API are same-origin on Vercel — SameSite=lax blocks
    // cross-site requests and avoids the CSRF surface of `none`.
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  };
}

router.post('/login', loginLimiter, async (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('[AUTH] Login timed out after', LOGIN_TIMEOUT_MS, 'ms');
      res.status(504).json({
        error: 'Login request timed out. The database may be temporarily unavailable.',
        code: 'LOGIN_TIMEOUT',
      });
    }
  }, LOGIN_TIMEOUT_MS);

  try {
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length > 100 || password.length > 200) {
      clearTimeout(timeout);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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

    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await run(
      `INSERT INTO sessions (id, username, "createdAt", "expiresAt") VALUES ($1, $2, $3, $4)`,
      [sessionId, ADMIN_USERNAME, now.toISOString(), expiresAt.toISOString()]
    );

    clearTimeout(timeout);
    if (res.headersSent) return;

    res.cookie('qr_session', sessionId, cookieOptions());

    console.log(`[AUTH] Login successful for user: ${ADMIN_USERNAME}`);
    res.json({ success: true, username: ADMIN_USERNAME });
  } catch (err) {
    clearTimeout(timeout);
    if (res.headersSent) return;
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({
      error: 'Database error during login. Please try again.',
      code: 'LOGIN_DB_ERROR',
    });
  }
});

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

router.get('/me', meLimiter, async (req, res) => {
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
    res.clearCookie('qr_session', { path: '/' });
    res.status(401).json({ error: 'Authentication check failed. Please log in again.' });
  }
});

module.exports = router;
