import { useState, useEffect, useCallback } from 'react';
import { api, onActiveAgencyChange } from '../utils/api';
import { getScoped, setScoped } from '../utils/sessionState';

// Active trip is persisted per-user (see sessionState) so two admins of the
// same agency keep their own active trip on the same browser.
const SELECTED_TRIP_BASE = 'activeTripId';

export function useTripContext() {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(() => getScoped(SELECTED_TRIP_BASE));
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
        setScoped(SELECTED_TRIP_BASE, null);
        setSelectedTripId(null);
      }
      if (!nextSelectedId && data.length > 0) {
        const active = data.find(t => t.status === 'active') || data[0];
        setSelectedTripId(active.id);
        setScoped(SELECTED_TRIP_BASE, active.id);
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
    setScoped(SELECTED_TRIP_BASE, tripId);
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
