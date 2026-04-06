import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Scanner from './pages/Scanner';
import TravelerList from './pages/TravelerList';
import QRCodes from './pages/QRCodes';
import { useWebSocket } from './hooks/useWebSocket';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import { useTripContext } from './hooks/useTripContext';

export default function App() {
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
        />
        <Routes>
          <Route path="/" element={
            <Dashboard tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
          } />
          <Route path="/scanner" element={
            <Scanner wsStatus={wsStatus} offlineQueue={offlineQueue} tripId={tripCtx.selectedTripId} />
          } />
          <Route path="/travelers" element={
            <TravelerList tripId={tripCtx.selectedTripId} lastMessage={lastMessage} trip={tripCtx.selectedTrip} />
          } />
          <Route path="/qrcodes" element={
            <QRCodes tripId={tripCtx.selectedTripId} trip={tripCtx.selectedTrip} />
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
