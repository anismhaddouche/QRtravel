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
      email: session.username,
      role: session.role || 'admin',
      agencyId: session.agencyId || null,
    };
    next();
  } catch (err) {
    console.error('[AUTH] middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

// requireAdmin = any admin-capable role (super_admin, agency_admin, legacy 'admin').
// For super-admin-only routes use requireSuperAdmin from lib/scope.
function requireAdmin(req, res, next) {
  const r = req.user?.role;
  if (!req.user || (r !== 'admin' && r !== 'super_admin' && r !== 'agency_admin')) {
    return res.status(403).json({ error: 'Admin privileges required', code: 'FORBIDDEN' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
