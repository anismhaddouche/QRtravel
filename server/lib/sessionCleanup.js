// Opportunistic expired-session purge.
//
// Runs at most once every CLEANUP_INTERVAL_MS per warm Vercel instance.
// No setInterval — the next /login or /logout call triggers a purge if
// the window has elapsed. Fire-and-forget so the user request is not
// blocked on it.

const { run } = require('../db');

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let lastRunAt = 0;
let inFlight = false;

async function _purgeNow() {
  inFlight = true;
  try {
    await run(`DELETE FROM sessions WHERE "expiresAt" < $1`, [new Date().toISOString()]);
  } catch (err) {
    console.warn('[sessionCleanup] purge failed (non-fatal):', err.message);
  } finally {
    inFlight = false;
  }
}

function maybePurgeExpiredSessions() {
  const now = Date.now();
  if (inFlight) return;
  if (now - lastRunAt < CLEANUP_INTERVAL_MS) return;
  lastRunAt = now;
  _purgeNow(); // fire-and-forget
}

module.exports = { maybePurgeExpiredSessions };
