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

async function request(url, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE}${url}`, config);
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
  // Trips
  getTrips: () => request('/trips'),
  getTrip: (id) => request(`/trips/${id}`),
  createTrip: (data) => request('/trips', { method: 'POST', body: data }),
  updateTrip: (id, data) => request(`/trips/${id}`, { method: 'PUT', body: data }),

  // Travelers
  getTravelers: (tripId) => request(`/travelers?tripId=${tripId}`),
  getTraveler: (id) => request(`/travelers/${id}`),
  createTraveler: (data) => request('/travelers', { method: 'POST', body: data }),
  updateTraveler: (id, data) => request(`/travelers/${id}`, { method: 'PUT', body: data }),
  deleteTraveler: (id) => request(`/travelers/${id}`, { method: 'DELETE' }),
  getStats: (tripId) => request(`/travelers/stats/summary?tripId=${tripId}`),

  // Check-in
  checkIn: (referenceCode, deviceId) => request('/checkin', { method: 'POST', body: { referenceCode, deviceId } }),
  undoCheckIn: (referenceCode) => request('/checkin/undo', { method: 'POST', body: { referenceCode } }),
  manualCheckIn: (travelerId) => request('/checkin/manual', { method: 'POST', body: { travelerId } }),
  getEvents: (limit = 20) => request(`/checkin/events?limit=${limit}`),
  syncEvents: (events) => request('/checkin/sync', { method: 'POST', body: { events } }),

  // QR Codes
  getQRCodes: (tripId) => request(`/qrcodes?tripId=${tripId}`),

  // Health
  health: () => request('/health'),
};
