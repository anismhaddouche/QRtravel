import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Scanner from './pages/Scanner';
import TravelerList from './pages/TravelerList';
import QRCodes from './pages/QRCodes';
import Trips from './pages/Trips';
import { useWebSocket } from './hooks/useWebSocket';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import { useTripContext } from './hooks/useTripContext';
import { api, setAuthErrorHandler } from './utils/api';

export default function App() {
  const [authState, setAuthState] = useState('checking'); // checking | authenticated | unauthenticated
  const [username, setUsername] = useState(null);

  // Check authentication on mount
  useEffect(() => {
    api.me()
      .then((data) => {
        setUsername(data.username);
        setAuthState('authenticated');
      })
      .catch(() => {
        setAuthState('unauthenticated');
      });
  }, []);

  // Register global 401 handler
  useEffect(() => {
    setAuthErrorHandler(() => {
      setAuthState('unauthenticated');
      setUsername(null);
    });
  }, []);

  const handleLogin = useCallback((user) => {
    setUsername(user);
    setAuthState('authenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    try { await api.logout(); } catch (e) { /* ignore */ }
    setUsername(null);
    setAuthState('unauthenticated');
  }, []);

  // Show loading spinner while checking auth
  if (authState === 'checking') {
    return (
      <div className="app">
        <div className="page">
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (authState === 'unauthenticated') {
    return <Login onLogin={handleLogin} />;
  }

  // Authenticated — render the full app
  return <AuthenticatedApp username={username} onLogout={handleLogout} />;
}

function AuthenticatedApp({ username, onLogout }) {
  const { status: wsStatus, lastMessage } = useWebSocket();
  const tripCtx = useTripContext();
  const offlineQueue = useOfflineQueue(wsStatus, tripCtx.selectedTripId);

  if (tripCtx.loading) {
    return (
      <div className="app">
        <div className="page">
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Header
          wsStatus={wsStatus}
          queueLength={offlineQueue.queueLength}
          syncStatus={offlineQueue.syncStatus}
          trips={tripCtx.trips}
          selectedTrip={tripCtx.selectedTrip}
          onSelectTrip={tripCtx.selectTrip}
          username={username}
          onLogout={onLogout}
        />
        <Routes>
          <Route path="/" element={
            <Dashboard tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
          } />
          <Route path="/scanner" element={
            <Scanner wsStatus={wsStatus} offlineQueue={offlineQueue} tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
          } />
          <Route path="/travelers" element={
            <TravelerList tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
          } />
          <Route path="/qrcodes" element={
            <QRCodes tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
          } />
          <Route path="/trips" element={
            <Trips onTripChange={tripCtx.refreshTrips} />
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
