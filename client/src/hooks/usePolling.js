import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';

/**
 * usePolling — replaces WebSocket with periodic polling.
 * Polls /api/health every 5 seconds to detect connectivity.
 * Returns the same interface as useWebSocket so callers need no changes.
 */
export function usePolling(intervalMs = 5000) {
  const [status, setStatus] = useState(navigator.onLine ? 'connected' : 'disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const timerRef = useRef(null);
  const tickRef = useRef(0);

  const poll = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus('disconnected');
      return;
    }
    try {
      await api.health();
      setStatus('connected');
      // Emit a synthetic "tick" message so pages that watch lastMessage refresh
      tickRef.current += 1;
      setLastMessage({ type: 'poll_tick', tick: tickRef.current, timestamp: new Date().toISOString() });
    } catch {
      setStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    // Initial check
    poll();
    timerRef.current = setInterval(poll, intervalMs);

    const handleOnline  = () => { setStatus('connected');    poll(); };
    const handleOffline = () => { setStatus('disconnected'); };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timerRef.current);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [poll, intervalMs]);

  // Expose setStatus so callers that set it externally don't break
  return { status, lastMessage, setStatus };
}
