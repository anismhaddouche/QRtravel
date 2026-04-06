import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../utils/api';

export function useWebSocket() {
  const [status, setStatus] = useState('disconnected'); // connected | disconnected
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pingTimer = useRef(null);
  const reconnectDelay = useRef(2000);

  const connect = useCallback(() => {
    const wsUrl = getWsUrl();

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectDelay.current = 2000; // Reset backoff on success
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'pong' && data.type !== 'connected') {
            setLastMessage(data);
          }
        } catch (e) { /* ignore */ }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        clearInterval(pingTimer.current);
        // Exponential backoff reconnect (max 30s)
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, 30000);
          connect();
        }, reconnectDelay.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      setStatus('disconnected');
      reconnectTimer.current = setTimeout(() => connect(), reconnectDelay.current);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(pingTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { status, lastMessage, setStatus };
}
