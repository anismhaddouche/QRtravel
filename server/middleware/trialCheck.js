
const { get } = require('../db');
const { isSuperAdmin } = require('../lib/scope');

async function checkTrialExpiry(req, res, next) {
  const session = req.betterAuthSession;
  if (!session?.user) return next();

  const user = session.user;

  // Only super admins are exempt from trial/subscription checks
  if (isSuperAdmin(user)) {
    return next();
  }

  // Find the trial/subscription expiration date at the agency level
  let expiryStr = null;
  if (user.agencyId) {
    try {
      const row = await get(
        'SELECT MAX("trialExpiresAt") AS expiry FROM "user" WHERE "agencyId" = $1',
        [user.agencyId]
      );
      expiryStr = row?.expiry;
    } catch (err) {
      console.error('[TRIAL] DB lookup error:', err.message);
    }
  }

  // Fallback to user's own expiration date if not linked to an agency
  if (!expiryStr && user.trialExpiresAt) {
    expiryStr = user.trialExpiresAt;
  }

  if (!expiryStr) return next();

  const now = new Date();
  const expiry = new Date(expiryStr);

  if (now > expiry) {
    return res.status(403).json({
      error: "Votre période d'essai est terminée, merci de nous contacter au XXXXXX ou par mail anis.haddouche@sofia-data.com afin de renouveler votre abonnement, 2000 DA par mois ou 20000 DA par 12 mois.",
      code: 'TRIAL_EXPIRED',
    });
  }

  next();
}

module.exports = { checkTrialExpiry };
