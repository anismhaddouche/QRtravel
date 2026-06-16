const { auth } = require('../auth');
const { checkTrialExpiry } = require('./trialCheck');

async function requireAuthCore(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'NO_SESSION' });
    }

    if (session.user.banned) {
      return res.status(403).json({
        error: session.user.banReason || 'Compte bloqué',
        code: 'BANNED',
      });
    }

    // Map Better Auth user to req.user for legacy compatibility
    req.user = {
      id: session.user.id,
      username: session.user.email,
      email: session.user.email,
      role: session.user.role || 'user',
      agencyId: session.user.agencyId || null,
    };
    req.betterAuthSession = session;
    next();
  } catch (err) {
    console.error('[AUTH] middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication check failed' });
  }
}

// Combine requireAuthCore and checkTrialExpiry
const requireAuth = [requireAuthCore, checkTrialExpiry];

// For local testing logic, we might need a raw version, but usually requireAuth is all we need.
module.exports = { requireAuth };
