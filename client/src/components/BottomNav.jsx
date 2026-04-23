import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ScanLine, MoreHorizontal } from 'lucide-react';

export default function BottomNav() {
  return (
    <nav className="bottom-nav" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(10, 15, 30, 0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '8px 8px calc(8px + env(safe-area-inset-bottom)) 8px',
      zIndex: 50,
    }}>
      <NavItem to="/" icon={<LayoutDashboard size={24} />} label="Accueil" end />
      <NavItem to="/scanner" icon={<ScanLine size={24} />} label="Scanner" />
      <NavItem to="/travelers" icon={<Users size={24} />} label="Voyageurs" />
      <NavItem to="/trips" icon={<MoreHorizontal size={24} />} label="Plus" />
    </nav>
  );
}

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink 
      to={to} 
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '8px 12px',
        color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
        textDecoration: 'none',
        transition: 'color 200ms ease',
        minWidth: '64px',
      })}
    >
      {icon}
      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{label}</span>
    </NavLink>
  );
}
