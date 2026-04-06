import { NavLink } from 'react-router-dom';

const statusConfig = {
  connected: { label: 'Online', className: 'connected' },
  disconnected: { label: 'Offline', className: 'disconnected' },
};

export default function Header({ wsStatus, queueLength, syncStatus, trips, selectedTrip, onSelectTrip }) {
  const st = statusConfig[wsStatus] || statusConfig.disconnected;

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <span className="header-logo">🚌</span>
          <span className="header-title">QR Check-In</span>
          {trips && trips.length > 1 && (
            <select
              className="trip-selector"
              value={selectedTrip?.id || ''}
              onChange={e => onSelectTrip(e.target.value)}
            >
              {trips.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {selectedTrip && trips.length <= 1 && (
            <span className="trip-name">{selectedTrip.name}</span>
          )}
        </div>

        <nav className="header-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/scanner" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            📷 Scanner
          </NavLink>
          <NavLink to="/travelers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            👥 Travelers
          </NavLink>
          <NavLink to="/qrcodes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            🔲 QR Codes
          </NavLink>
        </nav>

        <div className="header-status">
          {queueLength > 0 && (
            <span className="queue-badge" title={`${queueLength} scan(s) pending sync`}>
              {syncStatus === 'syncing' ? '⟳' : '⏳'} {queueLength}
            </span>
          )}
          <span className={`connection-badge ${st.className}`}>
            <span className="connection-dot"></span>
            {st.label}
          </span>
        </div>
      </div>
    </header>
  );
}
