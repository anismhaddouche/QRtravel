import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../utils/api';

const QUEUE_KEY = 'qr_checkin_offline_queue';
const CACHE_KEY = 'qr_checkin_traveler_cache';
const DEVICE_KEY = 'qr_checkin_device_id';

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'device-' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// Traveler cache for offline validation
function getCachedTravelers() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}

function setCachedTravelers(travelers) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(travelers));
}

export function useOfflineQueue(wsStatus, tripId) {
  const [queue, setQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  });
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error
  const [cachedTravelers, _setCachedTravelers] = useState(getCachedTravelers);
  const syncingRef = useRef(false);

  // Persist queue
  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }, [queue]);

  // Refresh traveler cache whenever we have connectivity and a tripId
  const refreshCache = useCallback(async (tid) => {
    if (!tid) return;
    try {
      const travelers = await api.getTravelers(tid);
      setCachedTravelers(travelers);
      _setCachedTravelers(travelers);
    } catch { /* offline — keep existing cache */ }
  }, []);

  useEffect(() => {
    if (wsStatus === 'connected' && tripId) {
      refreshCache(tripId);
    }
  }, [wsStatus, tripId, refreshCache]);

  // Validate a reference code against cached data
  const validateOffline = useCallback((referenceCode) => {
    const match = cachedTravelers.find(t => t.referenceCode === referenceCode);
    if (!match) return { valid: false, reason: 'UNKNOWN_CODE' };
    if (match.status === 'checked_in') return { valid: false, reason: 'ALREADY_CHECKED_IN', traveler: match };
    // Also check if already in the pending queue
    const pending = queue.find(e => e.referenceCode === referenceCode && e.action === 'check_in');
    if (pending) return { valid: false, reason: 'ALREADY_QUEUED', traveler: match };
    return { valid: true, traveler: match };
  }, [cachedTravelers, queue]);

  // Add event to queue
  const addToQueue = useCallback((referenceCode, action = 'check_in') => {
    const event = {
      eventId: uuidv4(),
      referenceCode,
      action,
      timestamp: new Date().toISOString(),
      deviceId: getDeviceId(),
    };
    setQueue(prev => [...prev, event]);

    // Optimistically update cached traveler status
    if (action === 'check_in') {
      _setCachedTravelers(prev => {
        const updated = prev.map(t =>
          t.referenceCode === referenceCode ? { ...t, status: 'checked_in', checkedInAt: event.timestamp } : t
        );
        setCachedTravelers(updated);
        return updated;
      });
    }

    return event;
  }, []);

  // Sync queued events to server
  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || syncingRef.current) return { synced: 0 };
    syncingRef.current = true;
    setSyncStatus('syncing');

    try {
      const result = await api.syncEvents(queue);

      // Report conflicts to be handled by caller
      const conflicts = result.results?.filter(r => r.status === 'skipped' || r.status === 'duplicate') || [];
      
      setQueue([]); // Clear all — server has processed them
      setSyncStatus('idle');
      syncingRef.current = false;
      return { ...result, conflicts };
    } catch (e) {
      setSyncStatus('error');
      syncingRef.current = false;
      return { synced: 0, error: e.message };
    }
  }, [queue]);

  // Auto-sync when connection is restored
  useEffect(() => {
    if (wsStatus === 'connected' && queue.length > 0 && !syncingRef.current) {
      const timer = setTimeout(() => syncQueue(), 1500); // Small delay to let WS stabilize
      return () => clearTimeout(timer);
    }
  }, [wsStatus, queue.length, syncQueue]);

  const clearQueue = useCallback(() => setQueue([]), []);

  return {
    queue,
    queueLength: queue.length,
    addToQueue,
    syncQueue,
    clearQueue,
    syncStatus,
    deviceId: getDeviceId(),
    validateOffline,
    refreshCache,
    cachedTravelers,
  };
}
