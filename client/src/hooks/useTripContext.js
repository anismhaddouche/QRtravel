import { useState, useEffect, useCallback } from 'react';
import { api, onActiveAgencyChange } from '../utils/api';

const SELECTED_TRIP_KEY = 'qr_checkin_selected_trip';

export function useTripContext() {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(() => {
    return localStorage.getItem(SELECTED_TRIP_KEY) || null;
  });
  const [loading, setLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    try {
      const data = await api.getTrips();
      setTrips(data);
      // If currently selected trip is no longer in the list (e.g. super_admin
      // switched agency), clear it so the UI can auto-select a valid one.
      let nextSelectedId = selectedTripId;
      if (selectedTripId && !data.find(t => t.id === selectedTripId)) {
        nextSelectedId = null;
        localStorage.removeItem(SELECTED_TRIP_KEY);
        setSelectedTripId(null);
      }
      if (!nextSelectedId && data.length > 0) {
        const active = data.find(t => t.status === 'active') || data[0];
        setSelectedTripId(active.id);
        localStorage.setItem(SELECTED_TRIP_KEY, active.id);
      }
    } catch (e) {
      console.error('Failed to fetch trips:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedTripId]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // Refetch when the super_admin switches active agency.
  useEffect(() => onActiveAgencyChange(() => { fetchTrips(); }), [fetchTrips]);

  const selectTrip = useCallback((tripId) => {
    setSelectedTripId(tripId);
    localStorage.setItem(SELECTED_TRIP_KEY, tripId);
  }, []);

  const selectedTrip = trips.find(t => t.id === selectedTripId) || null;

  return {
    trips,
    selectedTrip,
    selectedTripId,
    selectTrip,
    loading,
    refreshTrips: fetchTrips,
  };
}
