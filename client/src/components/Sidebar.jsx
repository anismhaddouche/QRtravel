import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ScanLine, QrCode, Map, LogOut, Plane, Shield, Building2 } from 'lucide-react';
import { api, getActiveAgencyId, setActiveAgencyId, onActiveAgencyChange } from '../utils/api';

export default function Sidebar({ isOnline, queueLength, syncStatus, trips, selectedTrip, onSelectTrip, username, role, onLogout }) {
  const isSuperAdmin = role === 'super_admin';
  const isAgencyAdmin = role === 'agency_admin' || role === 'admin';
  const [agencies, setAgencies] = useState([]);
  const [activeAgencyId, setActiveAgencyIdState] = useState(() => getActiveAgencyId());

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getAgencies().then(setAgencies).catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => onActiveAgencyChange(setActiveAgencyIdState), []);

  const handleAgencyChange = (id) => {
    setActiveAgencyId(id || null);
    setActiveAgencyIdState(id || null);
  };

  return (
    <aside className="sidebar glass-card" style={{
      position: 'fixed', top: '24px', bottom: '24px', left: '24px', width: '260px',
      display: 'flex', flexDirection: 'column', padding: '24px', zIndex: 50,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <div style={{
          background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-glow)'
        }}>
          <Plane size={24} />
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>VoyageCheck</h1>
      </div>

      {isSuperAdmin && (
        <div style={{ marginBottom: '16px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem', paddingLeft: '8px' }}>AGENCE ACTIVE</label>
          <select
            className="form-select"
            value={activeAgencyId || ''}
            onChange={e => handleAgencyChange(e.target.value)}
            style={{ background: 'var(--navy-surface)', border: '1px solid var(--border)' }}
          >
            <option value="">— Toutes / Aucune —</option>
            {agencies.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <label className="form-label" style={{ fontSize: '0.75rem', paddingLeft: '8px' }}>VOYAGE ACTIF</label>
        <select
          className="form-select"
          value={selectedTrip?.id || ''}
          onChange={e => onSelectTrip(e.target.value)}
          style={{ background: 'var(--navy-surface)', border: '1px solid var(--border)' }}
        >
          {!selectedTrip && <option value="" disabled>— Sélectionner —</option>}
          {trips.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} {t.date ? `(${t.date})` : ''}
            </option>
          ))}
        </select>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Tableau de bord" end />
        {isSuperAdmin && <NavItem to="/agencies" icon={<Building2 size={20} />} label="Agences" />}
        <NavItem to="/scanner" icon={<ScanLine size={20} />} label="Scanner" />
        <NavItem to="/travelers" icon={<Users size={20} />} label="Voyageurs" />
        <NavItem to="/qrcodes" icon={<QrCode size={20} />} label="Codes QR" />
        <NavItem to="/trips" icon={<Map size={20} />} label="Voyages" />
        {(isSuperAdmin || isAgencyAdmin) && (
          <NavItem to="/users" icon={<Shield size={20} />} label="Personnel" />
        )}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isOnline ? 'var(--success)' : 'var(--danger)',
              boxShadow: isOnline ? '0 0 8px var(--success)' : 'none'
            }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {isOnline ? 'En direct' : 'Hors ligne'}
            </span>
          </div>
          {queueLength > 0 && (
            <span className="badge badge-warning">
              {syncStatus === 'syncing' ? '⟳' : '⏳'} {queueLength}
            </span>
          )}
        </div>

        {username && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {username}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {role === 'super_admin' ? 'Super admin' : (role === 'agency_admin' || role === 'admin') ? 'Admin agence' : role}
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Déconnexion"
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', padding: '4px', transition: 'color 200ms ease'
              }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--danger-light)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', borderRadius: 'var(--radius-md)',
        color: isActive ? 'var(--white)' : 'var(--text-secondary)',
        background: isActive ? 'var(--accent)' : 'transparent',
        textDecoration: 'none', fontWeight: isActive ? 600 : 500,
        transition: 'all 200ms ease',
        boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
      })}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
