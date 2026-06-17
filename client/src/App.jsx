import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './components/Toast';
import { LoadingState } from './components/Skeleton';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Scanner from './pages/Scanner';
import TravelerDetails from './pages/TravelerDetails';
import Trips from './pages/Trips';
import Users from './pages/Users';
import Agencies from './pages/Agencies';
import { getActiveAgencyId, onActiveAgencyChange } from './utils/api';
import { usePolling } from './hooks/usePolling';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import { useTripContext } from './hooks/useTripContext';
import { api, setAuthErrorHandler, setTrialExpiredHandler } from './utils/api';
import { authClient } from './utils/auth-client';
import { setCurrentUser, getCurrentUserKey, clearLegacyGlobalKeys } from './utils/sessionState';
import { Button } from '@/components/ui/button';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function App() {
  const [authState, setAuthState] = useState('checking'); // checking | authenticated | unauthenticated | trial_expired
  const [username, setUsername] = useState(null);
  const [role, setRole] = useState(null);
  const [trialExpiredMessage, setTrialExpiredMessage] = useState('');
  // Stable per-account key used to scope persisted UI state and to remount
  // the authenticated tree (so no React state leaks between accounts).
  const [userKey, setUserKey] = useState(null);

  // One-time: drop legacy GLOBAL keys that used to be shared across accounts.
  useEffect(() => { clearLegacyGlobalKeys(); }, []);

  // Check authentication on mount
  useEffect(() => {
    authClient.getSession()
      .then(({ data, error }) => {
        if (error || !data?.session) {
          setCurrentUser(null);
          setAuthState('unauthenticated');
          return;
        }
        const user = data.user;
        const isSuper = user.role === 'super_admin' || (user.role === 'admin' && !user.agencyId);

        setCurrentUser({ id: user.id, username: user.email });
        setUserKey(getCurrentUserKey());
        setUsername(user.email);
        setRole(user.role || 'admin');

        if (user.banned) {
          setTrialExpiredMessage(user.banReason || "Votre compte est bloqué.");
          setAuthState('trial_expired');
          return;
        }

        if (!isSuper && user.trialExpiresAt && new Date() > new Date(user.trialExpiresAt)) {
          setTrialExpiredMessage("Votre période d'essai est terminée, merci de nous contacter au XXXXXX ou par mail anis.haddouche@sofia-data.com afin de renouveler votre abonnement, 2000 DA par mois ou 20000 DA par 12 mois.");
          setAuthState('trial_expired');
          return;
        }

        setAuthState('authenticated');
      })
      .catch(() => {
        setCurrentUser(null);
        setAuthState('unauthenticated');
      });
  }, []);

  // Register global 401 handler
  useEffect(() => {
    setAuthErrorHandler(() => {
      setCurrentUser(null);
      setUserKey(null);
      setAuthState('unauthenticated');
      setUsername(null);
      setRole(null);
    });
  }, []);

  // Register global 403 (trial expired) handler
  useEffect(() => {
    setTrialExpiredHandler((message) => {
      setTrialExpiredMessage(message || "Votre période d'essai est terminée, merci de nous contacter au XXXXXX ou par mail anis.haddouche@sofia-data.com afin de renouveler votre abonnement, 2000 DA par mois ou 20000 DA par 12 mois.");
      setAuthState('trial_expired');
    });
  }, []);

  const handleLogin = useCallback((user) => {
    const isSuper = user.role === 'super_admin' || (user.role === 'admin' && !user.agencyId);

    setCurrentUser({ id: user.id, username: user.email });
    setUserKey(getCurrentUserKey());
    setUsername(user.email);
    setRole(user.role || 'admin');

    if (user.banned) {
      setTrialExpiredMessage(user.banReason || "Votre compte est bloqué.");
      setAuthState('trial_expired');
      return;
    }

    if (!isSuper && user.trialExpiresAt && new Date() > new Date(user.trialExpiresAt)) {
      setTrialExpiredMessage("Votre période d'essai est terminée, merci de nous contacter au XXXXXX ou par mail anis.haddouche@sofia-data.com afin de renouveler votre abonnement, 2000 DA par mois ou 20000 DA par 12 mois.");
      setAuthState('trial_expired');
      return;
    }

    setAuthState('authenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    try { await authClient.signOut(); } catch (e) { /* ignore */ }
    // Drop the in-memory user binding so nothing of this account can be
    // read by the next login. Persisted per-user keys stay on disk so the
    // same account finds its own state again later.
    setCurrentUser(null);
    setUserKey(null);
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

  // Show login/landing pages if not authenticated
  if (authState === 'unauthenticated') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Show trial expired page if trial/subscription is expired
  if (authState === 'trial_expired') {
    return <TrialExpiredScreen message={trialExpiredMessage} onLogout={handleLogout} />;
  }

  // Authenticated — render the full app. `key={userKey}` forces a full
  // remount when the account changes, so every page's React state (trips,
  // travelers, events, users, selectedIds, active trip) starts clean and
  // no data from the previous account can appear, even briefly.
  return (
    <ToastProvider>
      <AuthenticatedApp key={userKey || 'anon'} username={username} role={role} onLogout={handleLogout} />
    </ToastProvider>
  );
}

function AuthenticatedApp({ username, role, onLogout }) {
  const isSuperAdmin = role === 'super_admin';
  const isAgencyAdmin = role === 'agency_admin' || role === 'admin';
  const canManageUsers = isSuperAdmin || role === 'agency_admin';
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
            <Route path="/travelers/:id" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <TravelerDetails role={role} />
            } />
            <Route path="/trips" element={
              needsAgencySelection
                ? <AgencyPrompt />
                : <Trips onTripChange={tripCtx.refreshTrips} selectedTripId={tripCtx.selectedTripId} onSelectTrip={tripCtx.selectTrip} />
            } />
            {isSuperAdmin && (
              <Route path="/agencies" element={<Agencies />} />
            )}
            {/* Personnel: super_admin (all agencies) and agency_admin (own agency). */}
            {canManageUsers && (
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

function TrialExpiredScreen({ message, onLogout }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-5"
      style={{ background: 'var(--bg-page)' }}
    >
      <div className="w-full max-w-md glass-card" style={{ padding: '32px', textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'rgb(239, 68, 68)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <ShieldAlert size={28} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)' }}>
          Période d&apos;essai expirée
        </h2>
        <p style={{
          fontSize: '0.95rem',
          lineHeight: '1.6',
          color: 'var(--text-muted)',
          marginBottom: '24px',
          whiteSpace: 'pre-line'
        }}>
          {message}
        </p>
        <Button
          onClick={onLogout}
          variant="outline"
          className="w-full flex items-center justify-center gap-2"
        >
          <LogOut size={16} />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
