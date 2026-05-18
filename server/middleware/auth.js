const { get } = require('../db');

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

    req.user = {
      id: session.userId || null,
      username: session.username,
      role: session.role || 'admin',
    };
    next();
  } catch (err) {
    console.error('[AUTH] middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required', code: 'FORBIDDEN' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
