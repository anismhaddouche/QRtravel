import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './components/Toast';
import { LoadingState } from './components/Skeleton';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Scanner from './pages/Scanner';
import TravelerList from './pages/TravelerList';
import QRCodes from './pages/QRCodes';
import Trips from './pages/Trips';
import { usePolling } from './hooks/usePolling';
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
        <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingState message="Vérification de l'authentification..." />
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (authState === 'unauthenticated') {
    return <Login onLogin={handleLogin} />;
  }

  // Authenticated — render the full app
  return (
    <ToastProvider>
      <AuthenticatedApp username={username} onLogout={handleLogout} />
    </ToastProvider>
  );
}

function AuthenticatedApp({ username, onLogout }) {
  const { status: isOnline, lastMessage } = usePolling();
  const tripCtx = useTripContext();
  const offlineQueue = useOfflineQueue(isOnline, tripCtx.selectedTripId);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (tripCtx.loading) {
    return (
      <div className="app">
        <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingState message="Chargement des voyages..." />
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app">
        {isDesktop ? (
          <Sidebar
            isOnline={isOnline === 'connected'}
            queueLength={offlineQueue.queueLength}
            syncStatus={offlineQueue.syncStatus}
            trips={tripCtx.trips}
            selectedTrip={tripCtx.selectedTrip}
            onSelectTrip={tripCtx.selectTrip}
            username={username}
            onLogout={onLogout}
          />
        ) : (
          <BottomNav />
        )}
        
        {/* On mobile, we might need a small header just for trip selection if it's not in the bottom nav, 
            but for now we'll put it inside the pages that need it, or they can use the "Plus/Trips" page */}
            
        <main className="main-content">
          <Routes>
            <Route path="/" element={
              <Dashboard tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/scanner" element={
              <Scanner isOnline={isOnline === 'connected'} offlineQueue={offlineQueue} tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/travelers" element={
              <TravelerList tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/qrcodes" element={
              <QRCodes tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/trips" element={
              <Trips onTripChange={tripCtx.refreshTrips} selectedTripId={tripCtx.selectedTripId} onSelectTrip={tripCtx.selectTrip} onLogout={!isDesktop ? onLogout : null} />
            } />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
