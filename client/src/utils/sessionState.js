// User-scoped UI session state.
//
// All persisted UI state that depends on *who is logged in* (active agency,
// active trip, …) is stored under a key namespaced by the user's stable id,
// e.g. `travelqr:<userId>:activeTripId`. Two accounts on the same browser
// therefore never share state, and a logged-out app reads nothing.
//
// Security note: this is purely a UX convenience. The backend remains the
// source of truth and still enforces every agency-scope / role check.

const PREFIX = 'travelqr';

// Old GLOBAL keys that used to be shared across every account on a browser.
// They are the root cause of the cross-account leak, so we delete them on
// boot — they must never be read again.
const LEGACY_GLOBAL_KEYS = [
  'qr_super_admin_active_agency_id',
  'qr_checkin_selected_trip',
];

// The id of the currently logged-in user. Set at login / session restore,
// cleared at logout. While null, all scoped reads return null and writes
// are no-ops, so nothing can leak between sessions.
let currentUserKey = null;

// Prefer the stable DB id; fall back to the username for the env-fallback
// admin which has no DB row (its username is fixed, so it is stable too).
// Email is never used directly as a key since it can change.
export function setCurrentUser(user) {
  currentUserKey = user ? String(user.id || user.username || 'unknown') : null;
}

export function getCurrentUserKey() {
  return currentUserKey;
}

function fullKey(base) {
  return currentUserKey ? `${PREFIX}:${currentUserKey}:${base}` : null;
}

export function getScoped(base) {
  try {
    const k = fullKey(base);
    return k ? (localStorage.getItem(k) || null) : null;
  } catch {
    return null;
  }
}

export function setScoped(base, value) {
  try {
    const k = fullKey(base);
    if (!k) return;
    if (value === null || value === undefined || value === '') {
      localStorage.removeItem(k);
    } else {
      localStorage.setItem(k, value);
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

export function removeScoped(base) {
  try {
    const k = fullKey(base);
    if (k) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// Delete the legacy global keys once, so an old shared value can never be
// picked up by a different account.
export function clearLegacyGlobalKeys() {
  try {
    for (const k of LEGACY_GLOBAL_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
