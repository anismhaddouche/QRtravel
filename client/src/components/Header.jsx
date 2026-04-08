import { NavLink } from 'react-router-dom';

const statusConfig = {
  connected: { label: 'Online', className: 'connected' },
  disconnected: { label: 'Offline', className: 'disconnected' },
};

export default function Header({ isOnline, queueLength, syncStatus, trips, selectedTrip, onSelectTrip, username, onLogout }) {
  const st = statusConfig[isOnline] || statusConfig.disconnected;

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <span className="header-logo">🚌</span>
          <span className="header-title">QR Check-In</span>
        </div>

        {/* Trip selector — always visible */}
        <div className="trip-selector-wrapper">
          <select
            className="trip-selector"
            value={selectedTrip?.id || ''}
            onChange={e => onSelectTrip(e.target.value)}
            id="select-trip"
          >
            {!selectedTrip && (
              <option value="" disabled>— Select a trip —</option>
            )}
            {trips.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.date ? `(${t.date})` : ''}
              </option>
            ))}
          </select>
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
          <NavLink to="/trips" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            🗺️ Trips
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
          {username && (
            <button className="btn btn-sm btn-logout" onClick={onLogout} title={`Logged in as ${username}`} id="btn-logout">
              🚪 Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
