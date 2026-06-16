import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, MoreHorizontal,
  Building2, Map, UserCog, LogOut, X,
} from 'lucide-react';
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
import { Label } from '@/components/ui/label';

export default function BottomNav({ role, username, onLogout }) {
  const isSuperAdmin = role === 'super_admin';
  const isAgencyAdmin = role === 'agency_admin' || role === 'admin';
  const canManageUsers = isSuperAdmin || role === 'agency_admin';
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the sheet when route changes
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Scanner must stay the dead-centre tab. With Personnel visible we run a
  // 5-column grid (Accueil | Voyages | Scanner | Personnel | Plus); without
  // it we fall back to the 4-column layout.
  const colsClass = canManageUsers ? ' bottom-nav-floating--5col' : '';

  return (
    <>
      <nav className={`bottom-nav bottom-nav-floating bottom-nav-floating--has-cta${colsClass}`} aria-label="Navigation principale">
        <NavItem to="/" icon={<LayoutDashboard size={22} />} label="Accueil" end />
        <NavItem to="/trips" icon={<Map size={22} />} label="Voyages" />
        <NavLink
          to="/scanner"
          className={({ isActive }) => `nav-tab nav-tab--scanner nav-tab--cta${isActive ? ' nav-tab--active' : ''}`}
          aria-label="Ouvrir le scanner"
        >
          <span className="nav-tab__cta-bubble"><ScanLine size={22} /></span>
          <span>Scanner</span>
        </NavLink>
        {canManageUsers && (
          <NavItem to="/users" icon={<UserCog size={22} />} label="Personnel" />
        )}
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
    const next = id === '__none__' ? null : id;
    setActiveAgencyId(next);
    setActiveAgencyIdState(next);
  };

  const menuItemClass =
    'w-full justify-start gap-3 px-4 py-6 text-base font-medium';

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
          <div>
            <div style={{ fontWeight: 700 }}>{username}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {role === 'super_admin' ? 'Super administrateur' : role === 'agency_admin' ? 'Responsable d’agence' : role === 'admin' ? 'Administrateur (Personnel)' : role}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X />
          </Button>
        </div>

        {isSuperAdmin && (
          <div className="mb-4 grid gap-2">
            <Label htmlFor="mobile-agency" className="text-[0.7rem] uppercase tracking-wider">
              Agence active
            </Label>
            <Select
              value={activeAgencyId || '__none__'}
              onValueChange={onAgencyChange}
            >
              <SelectTrigger id="mobile-agency" className="w-full">
                <SelectValue placeholder="— Aucune —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Aucune —</SelectItem>
                {agencies.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {/* Accueil / Voyages / Scanner / Personnel are primary tabs in the
              bottom nav, so they are intentionally not duplicated here. The
              Plus sheet only holds secondary actions. */}
          {isSuperAdmin && (
            <Button variant="ghost" className={menuItemClass} onClick={() => go('/agencies')}>
              <Building2 /> Agences
            </Button>
          )}
          <ThemeToggle variant="menu-item" />
          <Button
            variant="ghost"
            className={`${menuItemClass} text-destructive hover:text-destructive`}
            onClick={() => { onClose(); onLogout(); }}
          >
            <LogOut /> Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
