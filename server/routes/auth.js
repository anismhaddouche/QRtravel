const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, run } = require('../db');
const { createRateLimiter } = require('../middleware/rateLimit');
const { maybePurgeExpiredSessions } = require('../lib/sessionCleanup');

// Environment-based admin (kept ONLY as emergency / local-dev fallback).
// In production, prefer DB-stored users created via `npm run create-user`
// or the in-app admin panel.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ADMIN';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ADMIN123';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 15000;

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'login',
  message: 'Trop de tentatives de connexion. Réessayez plus tard.',
});

const meLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'me',
  message: 'Too many requests',
});

let cachedEnvHash = null;
async function getEnvPasswordHash() {
  if (cachedEnvHash) return cachedEnvHash;
  if (process.env.ADMIN_PASSWORD_HASH) {
    cachedEnvHash = process.env.ADMIN_PASSWORD_HASH;
  } else {
    cachedEnvHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  }
  return cachedEnvHash;
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  };
}

async function createSession(res, { userId, username, role }) {
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await run(
    `INSERT INTO sessions (id, username, "userId", role, "createdAt", "expiresAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, username, userId, role, now.toISOString(), expiresAt.toISOString()]
  );

  res.cookie('qr_session', sessionId, cookieOptions());
  maybePurgeExpiredSessions();
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
    const identifier = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (identifier.length > 200 || password.length > 200) {
      clearTimeout(timeout);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 1. Try DB user (case-insensitive on email)
    const dbUser = await get(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
      [identifier]
    );

    if (dbUser) {
      const valid = await bcrypt.compare(password, dbUser.passwordHash);
      if (!valid) {
        clearTimeout(timeout);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await createSession(res, { userId: dbUser.id, username: dbUser.email, role: dbUser.role });
      clearTimeout(timeout);
      if (res.headersSent) return;
      console.log(`[AUTH] DB login success: ${dbUser.email} (${dbUser.role})`);
      return res.json({ success: true, username: dbUser.email, role: dbUser.role });
    }

    // 2. Fallback: env-based admin (emergency / local dev)
    if (identifier.toUpperCase() === ADMIN_USERNAME.toUpperCase()) {
      const hash = await getEnvPasswordHash();
      const valid = await bcrypt.compare(password, hash);
      if (!valid) {
        clearTimeout(timeout);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await createSession(res, { userId: null, username: ADMIN_USERNAME, role: 'admin' });
      clearTimeout(timeout);
      if (res.headersSent) return;
      console.log(`[AUTH] Env-fallback admin login: ${ADMIN_USERNAME}`);
      return res.json({ success: true, username: ADMIN_USERNAME, role: 'admin' });
    }

    clearTimeout(timeout);
    return res.status(401).json({ error: 'Invalid credentials' });
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
  maybePurgeExpiredSessions();
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

    res.json({ username: session.username, role: session.role || 'admin' });
  } catch (err) {
    console.error('[AUTH] /me error:', err.message);
    res.clearCookie('qr_session', { path: '/' });
    res.status(401).json({ error: 'Authentication check failed. Please log in again.' });
  }
});

module.exports = router;
