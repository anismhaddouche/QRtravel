const { get } = require('../db');

// Validate session cookie. On Vercel serverless we do NOT register a
// module-level setInterval cleanup — long-running timers leak across
// invocations and are unsupported. Expired sessions are filtered by
// the SQL "expiresAt" predicate below and can be purged separately
// via a scheduled DB job if/when accumulation becomes a concern.
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
      res.clearCookie('qr_session', { path: '/' });
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    req.user = { username: session.username };
    next();
  } catch (err) {
    console.error('[AUTH] middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

module.exports = { requireAuth };
