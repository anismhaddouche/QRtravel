import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, MoreHorizontal,
  Building2, Map, Shield, LogOut, X, Plane,
} from 'lucide-react';
import { api, getActiveAgencyId, setActiveAgencyId, onActiveAgencyChange } from '../utils/api';
import ThemeToggle from './ThemeToggle';

export default function BottomNav({ role, username, onLogout }) {
  const isSuperAdmin = role === 'super_admin';
  const isAgencyAdmin = role === 'agency_admin' || role === 'admin';
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the sheet when route changes
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <>
      <nav className="bottom-nav bottom-nav-floating bottom-nav-floating--has-cta" aria-label="Navigation principale">
        <NavItem to="/" icon={<LayoutDashboard size={22} />} label="Accueil" end />
        <NavItem to="/trips" icon={<Map size={22} />} label="Voyages" />
        <NavLink
          to="/scanner"
          className={({ isActive }) => `nav-tab nav-tab--cta${isActive ? ' nav-tab--active' : ''}`}
          aria-label="Ouvrir le scanner"
        >
          <span className="nav-tab__cta-bubble"><ScanLine size={22} /></span>
          <span>Scanner</span>
        </NavLink>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          className="nav-tab"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <MoreHorizontal size={22} />
          <span>Plus</span>
        </button>
      </nav>

      {menuOpen && (
        <MobileMenu
          role={role}
          isSuperAdmin={isSuperAdmin}
          isAgencyAdmin={isAgencyAdmin}
          username={username}
          onClose={() => setMenuOpen(false)}
          onLogout={onLogout}
        />
      )}
    </>
  );
}

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-tab${isActive ? ' nav-tab--active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function MobileMenu({ isSuperAdmin, isAgencyAdmin, username, role, onClose, onLogout }) {
  const navigate = useNavigate();
  const [agencies, setAgencies] = useState([]);
  const [activeAgencyId, setActiveAgencyIdState] = useState(() => getActiveAgencyId());

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getAgencies().then(setAgencies).catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => onActiveAgencyChange(setActiveAgencyIdState), []);

  const go = (to) => { navigate(to); onClose(); };
  const onAgencyChange = (id) => {
    setActiveAgencyId(id || null);
    setActiveAgencyIdState(id || null);
  };

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 16px', borderRadius: 'var(--radius-md)',
    width: '100%', textAlign: 'left', cursor: 'pointer',
    background: 'transparent', border: 'none', color: 'var(--text-primary)',
    fontSize: '1rem', fontWeight: 500,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--scrim)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card"
        style={{
          width: '100%', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Plane size={20} />
            <div>
              <div style={{ fontWeight: 700 }}>{username}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {role === 'super_admin' ? 'Super admin' : (role === 'agency_admin' || role === 'admin') ? 'Admin agence' : role}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: 8 }}>
            <X size={22} />
          </button>
        </div>

        {isSuperAdmin && (
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontSize: '0.7rem' }}>AGENCE ACTIVE</label>
            <select
              className="form-select"
              value={activeAgencyId || ''}
              onChange={e => onAgencyChange(e.target.value)}
            >
              <option value="">— Aucune —</option>
              {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button style={itemStyle} onClick={() => go('/')}><LayoutDashboard size={20} /> Tableau de bord</button>
          {isSuperAdmin && (
            <button style={itemStyle} onClick={() => go('/agencies')}><Building2 size={20} /> Agences</button>
          )}
          <button style={itemStyle} onClick={() => go('/trips')}><Map size={20} /> Voyages</button>
          <button style={itemStyle} onClick={() => go('/scanner')}><ScanLine size={20} /> Scanner</button>
          {/* Personnel is super_admin only — agency_admin cannot manage users. */}
          {isSuperAdmin && (
            <button style={itemStyle} onClick={() => go('/users')}><Shield size={20} /> Personnel</button>
          )}
          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />
          <ThemeToggle variant="menu-item" />
          <button
            style={{ ...itemStyle, color: 'var(--danger-light)' }}
            onClick={() => { onClose(); onLogout(); }}
          >
            <LogOut size={20} /> Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
