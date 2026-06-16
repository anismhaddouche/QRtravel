// Resolve API base URL from environment or same-origin
const envUrl = import.meta.env.VITE_API_URL || '';
export const API_BASE = envUrl ? `${envUrl}/api` : '/api';

// Derive WebSocket URL from the API URL
export function getWsUrl() {
  if (envUrl) {
    const url = new URL(envUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}`;
  }
  // Same-origin: use current page host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev mode (Vite), proxy to port 3000
  const host = window.location.port === '5173'
    ? `${window.location.hostname}:3000`
    : window.location.host;
  return `${protocol}//${host}`;
}

import { getScoped, setScoped } from './sessionState';

// Global auth state callback — set by App.jsx
let onAuthError = null;
export function setAuthErrorHandler(handler) {
  onAuthError = handler;
}

// ─── Super-admin selected agency ─────────────────────────────────────
// Persisted per-user (see sessionState): two accounts on the same browser
// never share an active agency. agency_admin users ignore this entirely
// (the backend forces their scope). Only used to inject ?agencyId= onto
// super_admin reads so they can browse one agency at a time.
const ACTIVE_AGENCY_BASE = 'activeAgencyId';
const agencyListeners = new Set();
export function getActiveAgencyId() {
  return getScoped(ACTIVE_AGENCY_BASE);
}
export function setActiveAgencyId(id) {
  setScoped(ACTIVE_AGENCY_BASE, id || null);
  for (const fn of agencyListeners) { try { fn(id || null); } catch { /* ignore */ } }
}
export function onActiveAgencyChange(fn) {
  agencyListeners.add(fn);
  return () => agencyListeners.delete(fn);
}
function appendAgencyParam(url) {
  const id = getActiveAgencyId();
  if (!id) return url;
  return url.includes('?') ? `${url}&agencyId=${encodeURIComponent(id)}` : `${url}?agencyId=${encodeURIComponent(id)}`;
}

async function request(url, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send HttpOnly cookies
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE}${url}`, config);

  // Handle 401 globally — redirect to login
  if (response.status === 401 && onAuthError) {
    onAuthError();
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Auth handles are now done via auth-client.js, but keeping this object for other endpoints

  // Agencies (super_admin only)
  getAgencies: () => request('/agencies'),
  getAgency: (id) => request(`/agencies/${id}`),
  createAgency: (data) => request('/agencies', { method: 'POST', body: data }),
  createAgencyWithAdmin: (data) => request('/agencies/with-admin', { method: 'POST', body: data }),
  updateAgency: (id, data) => request(`/agencies/${id}`, { method: 'PUT', body: data }),
  deleteAgency: (id, { force = false } = {}) =>
    request(`/agencies/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // Trips
  getTrips: () => request(appendAgencyParam('/trips')),
  getTrip: (id) => request(`/trips/${id}`),
  // super_admin creates trips in the context of the active agency. Attach
  // its id so the backend knows the target agency. agency_admin has no
  // active agency (getActiveAgencyId() === null) and the backend forces
  // their own agencyId, so the body value is ignored for them.
  createTrip: (data) => {
    const agencyId = getActiveAgencyId();
    return request('/trips', { method: 'POST', body: agencyId ? { ...data, agencyId } : data });
  },
  updateTrip: (id, data) => request(`/trips/${id}`, { method: 'PUT', body: data }),
  deleteTrip: (id) => request(`/trips/${id}`, { method: 'DELETE' }),

  // Travelers
  getTravelers: (tripId) => request(`/travelers?tripId=${tripId}`),
  getTraveler: (id) => request(`/travelers/${id}`),
  createTraveler: (data) => request('/travelers', { method: 'POST', body: data }),
  updateTraveler: (id, data) => request(`/travelers/${id}`, { method: 'PUT', body: data }),
  deleteTraveler: (id) => request(`/travelers/${id}`, { method: 'DELETE' }),
  bulkDeleteTravelers: (travelerIds) =>
    request('/travelers/bulk', { method: 'DELETE', body: { travelerIds } }),
  getStats: (tripId) => request(`/travelers/stats/summary?tripId=${tripId}`),
  importTravelersCsv: async (tripId, csvText) => {
    const response = await fetch(`${API_BASE}/travelers/import-csv?tripId=${encodeURIComponent(tripId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      credentials: 'include',
      body: csvText,
    });
    if (response.status === 401 && onAuthError) {
      onAuthError();
      const err = new Error('Authentication required'); err.status = 401; throw err;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || 'CSV import failed');
      err.status = response.status; err.code = data.code; err.data = data;
      throw err;
    }
    return data;
  },

  // Check-in (tripId is REQUIRED — backend rejects without it)
  checkIn: (referenceCode, tripId, deviceId) =>
    request('/checkin', { method: 'POST', body: { referenceCode, tripId, deviceId } }),
  undoCheckIn: (referenceCode, tripId) =>
    request('/checkin/undo', { method: 'POST', body: { referenceCode, tripId } }),
  manualCheckIn: (travelerId, tripId) =>
    request('/checkin/manual', { method: 'POST', body: { travelerId, tripId } }),
  bulkManualCheckIn: (travelerIds, tripId) =>
    request('/checkin/manual/bulk', { method: 'POST', body: { travelerIds, tripId } }),
  bulkUndoCheckIn: (travelerIds, tripId) =>
    request('/checkin/undo/bulk', { method: 'POST', body: { travelerIds, tripId } }),
  getEvents: (limit = 20, tripId) =>
    request(`/checkin/events?limit=${limit}${tripId ? `&tripId=${encodeURIComponent(tripId)}` : ''}`),
  syncEvents: (events, tripId) =>
    request('/checkin/sync', { method: 'POST', body: { events, tripId } }),

  // QR Codes
  getQRCodes: (tripId) => request(`/qrcodes?tripId=${tripId}`),

  // Users (admin only)
  getUsers: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: data }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, password) =>
    request(`/users/${id}/reset-password`, { method: 'POST', body: { password } }),

  // Health
  health: () => fetch(`${API_BASE}/health`).then(r => r.json()),
};
