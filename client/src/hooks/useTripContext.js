import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

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
      // Auto-select first active trip if none selected
      if (!selectedTripId && data.length > 0) {
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
