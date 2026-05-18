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
import Users from './pages/Users';
import Agencies from './pages/Agencies';
import { getActiveAgencyId, onActiveAgencyChange } from './utils/api';
import { usePolling } from './hooks/usePolling';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import { useTripContext } from './hooks/useTripContext';
import { api, setAuthErrorHandler } from './utils/api';

export default function App() {
  const [authState, setAuthState] = useState('checking'); // checking | authenticated | unauthenticated
  const [username, setUsername] = useState(null);
  const [role, setRole] = useState(null);

  // Check authentication on mount
  useEffect(() => {
    api.me()
      .then((data) => {
        setUsername(data.username);
        setRole(data.role || 'admin');
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
      setRole(null);
    });
  }, []);

  const handleLogin = useCallback((user, userRole) => {
    setUsername(user);
    setRole(userRole || 'admin');
    setAuthState('authenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    try { await api.logout(); } catch (e) { /* ignore */ }
    setUsername(null);
    setRole(null);
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
      <AuthenticatedApp username={username} role={role} onLogout={handleLogout} />
    </ToastProvider>
  );
}

function AuthenticatedApp({ username, role, onLogout }) {
  const isSuperAdmin = role === 'super_admin';
  const { status: isOnline, lastMessage } = usePolling();
  const tripCtx = useTripContext();
  const offlineQueue = useOfflineQueue(isOnline, tripCtx.selectedTripId);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [activeAgencyId, setActiveAgencyId] = useState(() => getActiveAgencyId());
  useEffect(() => onActiveAgencyChange(setActiveAgencyId), []);
  const needsAgencySelection = isSuperAdmin && !activeAgencyId;

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
            role={role}
            onLogout={onLogout}
          />
        ) : (
          <BottomNav role={role} username={username} onLogout={onLogout} />
        )}
        
        {/* On mobile, we might need a small header just for trip selection if it's not in the bottom nav, 
            but for now we'll put it inside the pages that need it, or they can use the "Plus/Trips" page */}
            
        <main className="main-content">
          <Routes>
            <Route path="/" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <Dashboard tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/scanner" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <Scanner isOnline={isOnline === 'connected'} offlineQueue={offlineQueue} tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/travelers" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <TravelerList tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/qrcodes" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <QRCodes tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
            } />
            <Route path="/trips" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <Trips onTripChange={tripCtx.refreshTrips} selectedTripId={tripCtx.selectedTripId} onSelectTrip={tripCtx.selectTrip} onLogout={!isDesktop ? onLogout : null} />
            } />
            {isSuperAdmin && (
              <Route path="/agencies" element={<Agencies />} />
            )}
            {/* Personnel is super_admin only — agency_admin cannot manage users. */}
            {isSuperAdmin && (
              <Route path="/users" element={<Users currentUsername={username} currentRole={role} />} />
            )}
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function AgencyPrompt() {
  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '40px auto', textAlign: 'center' }}>
      <h2 style={{ marginBottom: '12px' }}>Aucune agence sélectionnée</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Sélectionnez une agence dans la barre latérale (ou ouvrez la page <strong>Agences</strong>)
        pour gérer ses voyages et voyageurs.
      </p>
    </div>
  );
}
