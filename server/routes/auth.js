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

// Lazily hash the password once and cache it
let cachedPasswordHash = null;
async function getPasswordHash() {
  if (cachedPasswordHash) return cachedPasswordHash;
  // Check if env provides a pre-hashed password
  if (process.env.ADMIN_PASSWORD_HASH) {
    cachedPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  } else {
    cachedPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  }
  return cachedPasswordHash;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Validate credentials
  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const hash = await getPasswordHash();
  const valid = await bcrypt.compare(password, hash);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create session
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await run(
    `INSERT INTO sessions (id, username, "createdAt", "expiresAt") VALUES ($1, $2, $3, $4)`,
    [sessionId, username, now.toISOString(), expiresAt.toISOString()]
  );

  // Set HttpOnly cookie
  res.cookie('qr_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });

  res.json({ success: true, username });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.qr_session;
  if (sessionId) {
    await run(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  }
  res.clearCookie('qr_session', { path: '/' });
  res.json({ success: true });
});

// GET /api/auth/me — check current session
router.get('/me', async (req, res) => {
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
});

module.exports = router;
