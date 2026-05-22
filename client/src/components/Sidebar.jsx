import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ScanLine, Map, LogOut, Plane, Shield, Building2 } from 'lucide-react';
import { api, getActiveAgencyId, setActiveAgencyId, onActiveAgencyChange } from '../utils/api';
import ThemeToggle from './ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Sidebar({ isOnline, queueLength, syncStatus, trips, selectedTrip, onSelectTrip, username, role, onLogout }) {
  const isSuperAdmin = role === 'super_admin';
  const [agencies, setAgencies] = useState([]);
  const [activeAgencyId, setActiveAgencyIdState] = useState(() => getActiveAgencyId());

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getAgencies().then(setAgencies).catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => onActiveAgencyChange(setActiveAgencyIdState), []);

  const handleAgencyChange = (id) => {
    const next = id === '__none__' ? null : id;
    setActiveAgencyId(next);
    setActiveAgencyIdState(next);
  };

  return (
    <aside className="sidebar" style={{
      position: 'fixed', top: 0, bottom: 0, left: 0, width: '252px',
      display: 'flex', flexDirection: 'column', padding: '16px 14px', zIndex: 50,
      background: 'var(--surface-1)',
      borderRight: '1px solid var(--border)',
    }}>
      <div className="brand" style={{ marginBottom: '20px' }}>
        <span className="brand__mark"><Plane size={22} /></span>
        <div>
          <div className="brand__name">VoyageCheck</div>
          <div className="brand__sub">Check-in QR</div>
        </div>
      </div>

      {isSuperAdmin && (
        <div style={{ marginBottom: '12px' }}>
          <div className="nav-section-label">Agence active</div>
          <Select
            value={activeAgencyId || '__none__'}
            onValueChange={handleAgencyChange}
          >
            <SelectTrigger className="w-full sidebar-select-trigger">
              <SelectValue placeholder="— Toutes / Aucune —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Toutes / Aucune —</SelectItem>
              {agencies.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div style={{ marginBottom: '6px' }}>
        <div className="nav-section-label">Voyage actif</div>
        <Select
          value={selectedTrip?.id || ''}
          onValueChange={(id) => onSelectTrip(id)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— Sélectionner —" />
          </SelectTrigger>
          <SelectContent>
            {trips.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} {t.date ? `(${t.date})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="nav-section-label">Menu</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Tableau de bord" end />
        <NavItem to="/scanner" icon={<ScanLine size={18} />} label="Scanner" />
        <NavItem to="/trips" icon={<Map size={18} />} label="Voyages" />
        {isSuperAdmin && <NavItem to="/agencies" icon={<Building2 size={18} />} label="Agences" />}
        {/* Personnel is super_admin only — agency_admin cannot manage users. */}
        {isSuperAdmin && (
          <NavItem to="/users" icon={<Shield size={18} />} label="Personnel" />
        )}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isOnline ? 'var(--success)' : 'var(--danger)',
              boxShadow: isOnline ? '0 0 8px var(--success)' : 'none'
            }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px', borderRadius: '14px',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '10px',
          }}>
            <span className="avatar avatar--sm">{(username || '?').slice(0, 1)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {username}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {role === 'super_admin' ? 'Super administrateur' : (role === 'agency_admin' || role === 'admin') ? 'Administrateur d’agence' : role}
              </div>
            </div>
          </div>
        )}

        <div className="sidebar-footer-actions">
          <Button
            variant="destructive"
            onClick={onLogout}
            className="sidebar-logout"
          >
            <LogOut />
            <span>Déconnexion</span>
          </Button>
          <ThemeToggle className="sidebar-theme-toggle" />
        </div>
      </div>
    </aside>
  );
}

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
