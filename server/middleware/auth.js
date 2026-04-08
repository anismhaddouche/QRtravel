const { get, run } = require('../db');

// Check if session is valid
async function requireAuth(req, res, next) {
  const sessionId = req.cookies?.qr_session;

  if (!sessionId) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_SESSION' });
  }

  try {
    const session = await get(
      `SELECT * FROM sessions WHERE id = $1 AND "expiresAt" > $2`,
      [sessionId, new Date().toISOString()]
    );

    if (!session) {
      res.clearCookie('qr_session');
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    req.user = { username: session.username };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

// Clean up expired sessions periodically
async function cleanExpiredSessions() {
  try {
    await run(`DELETE FROM sessions WHERE "expiresAt" < $1`, [new Date().toISOString()]);
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Run cleanup every 30 minutes
setInterval(cleanExpiredSessions, 30 * 60 * 1000);

module.exports = { requireAuth };
