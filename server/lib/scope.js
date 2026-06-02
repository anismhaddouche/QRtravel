// Tenant-scope helpers.
//
// req.user shape (after requireAuth):
//   { id, username, email, role, agencyId }
//
// Roles:
//   super_admin  — bypasses all agency scoping
//   agency_admin — restricted to req.user.agencyId
//   staff        — restricted to req.user.agencyId, fewer privileges
//
// Legacy roles still seen in DB:
//   'admin' is treated as agency_admin when agencyId is set,
//   otherwise as super_admin (legacy env-fallback ADMIN login).

function isSuperAdmin(user) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  // Legacy env-fallback admin (no DB user, no agency) = platform admin.
  if (user.role === 'admin' && !user.agencyId) return true;
  return false;
}

function isAgencyAdmin(user) {
  if (!user) return false;
  if (user.role === 'agency_admin') return true;
  if (user.role === 'admin' && user.agencyId) return true;
  return false;
}

function isStaff(user) {
  return !!user && user.role === 'staff';
}

function canManageUsers(user) {
  return isSuperAdmin(user) || isAgencyAdmin(user);
}

// Returns the agencyId a non-super user is bound to, or null for super_admin.
// For non-super users without an agencyId this returns a sentinel that
// guarantees zero rows match (so misconfigured accounts can't see data).
function effectiveAgencyId(user) {
  if (isSuperAdmin(user)) return null;
  return user?.agencyId || '__NO_AGENCY__';
}

// Build a SQL fragment + params to scope a query by agency.
// Usage:
//   const sc = scopeAgency(req.user, 'agencyId', params.length);
//   sql += sc.sql;  params.push(...sc.params);
function scopeAgency(user, column = 'agencyId', startIndex = 0) {
  if (isSuperAdmin(user)) return { sql: '', params: [] };
  return {
    sql: ` AND "${column}" = $${startIndex + 1}`,
    params: [effectiveAgencyId(user)],
  };
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Super admin required', code: 'FORBIDDEN' });
  }
  next();
}

function requireAgencyScope(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  if (!req.user?.agencyId) {
    return res.status(403).json({ error: 'Agency scope required', code: 'NO_AGENCY' });
  }
  next();
}

// User-management gate: super_admin (global) OR agency_admin (own agency).
// An agency_admin without an agencyId is a misconfigured account and is
// refused, so it can never fall through to an unscoped query.
function requireManageUsers(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  if (isAgencyAdmin(req.user)) {
    if (!req.user?.agencyId) {
      return res.status(403).json({ error: 'No agency on account', code: 'NO_AGENCY' });
    }
    return next();
  }
  return res.status(403).json({ error: 'User management requires admin privileges', code: 'FORBIDDEN' });
}

// Per-agency cap on personnel accounts. super_admin is exempt.
const AGENCY_USER_LIMIT = 3;

module.exports = {
  isSuperAdmin,
  isAgencyAdmin,
  isStaff,
  canManageUsers,
  effectiveAgencyId,
  scopeAgency,
  requireSuperAdmin,
  requireAgencyScope,
  requireManageUsers,
  AGENCY_USER_LIMIT,
};
