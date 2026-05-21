import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { SkeletonStats, SkeletonTable } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Users, UserCheck, UserX, LayoutDashboard, History, RefreshCw, MessageCircle, Mail, Copy } from 'lucide-react';
import { buildWhatsAppLink, buildMailtoLink, getTravelerQrLink } from '../utils/share';

// Order matters — rendered left-to-right.
const FILTER_ORDER = ['all', 'checked_in', 'remaining'];
const FILTERS = {
  all: { label: 'Toutes les personnes', color: 'var(--text-primary)', icon: Users },
  checked_in: { label: 'Embarqués', color: 'var(--success-light)', icon: UserCheck },
  remaining: { label: 'Restants', color: 'var(--warning-light)', icon: UserX },
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function Dashboard({ tripId, lastMessage, trip }) {
  const [stats, setStats] = useState(null);
  const [travelers, setTravelers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!tripId) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [statsData, travelersData, eventsData] = await Promise.all([
        api.getStats(tripId),
        api.getTravelers(tripId),
        api.getEvents(10, tripId),
      ]);
      setStats(statsData);
      setTravelers(travelersData);
      setEvents(eventsData);
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (lastMessage && (lastMessage.type === 'check_in' || lastMessage.type === 'undo_check_in')) {
      fetchData();
    }
  }, [lastMessage, fetchData]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const copyText = async (text, label) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      showToast(label || 'Copié');
    } catch { showToast('Copie impossible'); }
  };

  const filteredTravelers = useMemo(() => {
    if (filter === 'remaining') return travelers.filter(t => t.status === 'not_checked_in');
    if (filter === 'checked_in') return travelers.filter(t => t.status === 'checked_in');
    return travelers;
  }, [travelers, filter]);

  if (!tripId) {
    return (
      <div style={{ marginTop: '48px' }}>
        <EmptyState
          icon={LayoutDashboard}
          title="Aucun voyage sélectionné"
          description="Sélectionnez un voyage dans le menu ou créez-en un nouveau pour voir les statistiques."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"><LayoutDashboard size={28} className="text-accent" /> Tableau de bord</h1>
            <p className="page-subtitle">Chargement des données...</p>
          </div>
        </div>
        <SkeletonStats />
        <div className="form-grid-2">
          <SkeletonTable rows={3} />
          <SkeletonTable rows={3} />
        </div>
      </div>
    );
  }

  const current = FILTERS[filter];
  const CurrentIcon = current.icon;
  const agencyName = trip?.agencyName;

  const renderActions = (t) => {
    const qrLink = getTravelerQrLink(t.referenceCode);
    const wa = buildWhatsAppLink({ traveler: t, trip, qrLink, agencyName });
    const mt = buildMailtoLink({ traveler: t, trip, qrLink, agencyName });
    // Stop click propagation so action buttons don't trigger the row navigation.
    const stop = (e) => e.stopPropagation();
    return (
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}
        onClick={stop}
      >
        {wa && (
          <a
            className="btn btn-sm btn-outline"
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            title="Envoyer par WhatsApp"
            aria-label={`Envoyer le QR à ${t.displayName} par WhatsApp`}
            onClick={stop}
          >
            <MessageCircle size={14} />
          </a>
        )}
        {mt && (
          <a
            className="btn btn-sm btn-outline"
            href={mt}
            title="Envoyer par email"
            aria-label={`Envoyer le QR à ${t.displayName} par email`}
            onClick={stop}
          >
            <Mail size={14} />
          </a>
        )}
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={(e) => { stop(e); copyText(qrLink || t.referenceCode, `Lien QR de ${t.displayName} copié`); }}
          title="Copier le lien du QR code"
          aria-label={`Copier le lien QR de ${t.displayName}`}
        >
          <Copy size={14} />
        </button>
      </div>
    );
  };

  const goToTraveler = (id) => navigate(`/travelers/${id}`);
  const rowKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToTraveler(id); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><LayoutDashboard size={28} style={{ color: 'var(--accent)' }} /> Tableau de bord</h1>
          <p className="page-subtitle">
            {trip ? trip.name : 'Voyage'} {trip?.date ? `— ${trip.date}` : ''}
          </p>
        </div>
        <button
          className="btn btn-outline"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Actualiser
        </button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div className="glass-card" style={{ borderTop: '4px solid var(--accent)' }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Unités</div>
              <Users size={20} style={{ color: 'var(--accent-light)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '8px', color: 'var(--white)' }}>{stats.totalUnits}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stats.totalPeople} personnes</div>
          </div>

          <div className="glass-card" style={{ borderTop: '4px solid var(--success)' }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Embarqués</div>
              <UserCheck size={20} style={{ color: 'var(--success-light)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '8px', color: 'var(--success)' }}>{stats.checkedInUnits}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stats.checkedInPeople} personnes</div>
          </div>

          <div className="glass-card" style={{ borderTop: '4px solid var(--warning)' }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Restants</div>
              <UserX size={20} style={{ color: 'var(--warning-light)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '8px', color: 'var(--warning)' }}>{stats.missingUnits}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stats.missingPeople} personnes</div>
          </div>
        </div>
      )}

      <div className="form-grid-2">
        {/* Filterable travelers list */}
        <div className="glass-card">
          <div className="glass-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="glass-card-title" style={{ color: current.color }}>
              <CurrentIcon size={20} /> {current.label} ({filteredTravelers.length})
            </h2>
            <div
              role="tablist"
              aria-label="Filtrer la liste"
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--surface-2, rgba(255,255,255,0.04))',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                flexWrap: 'wrap',
              }}
            >
              {FILTER_ORDER.map((key) => {
                const f = FILTERS[key];
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(key)}
                    className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.8rem',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--white)' : 'var(--text-secondary)',
                      border: 'none',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredTravelers.length === 0 ? (
            <EmptyState
              icon={current.icon}
              title={filter === 'remaining' ? 'Tout le monde est là !' : filter === 'checked_in' ? 'Aucun embarquement' : 'Aucun voyageur'}
              description={
                filter === 'remaining'
                  ? 'Tous les voyageurs de ce voyage ont embarqué.'
                  : filter === 'checked_in'
                    ? 'Personne n\'a encore embarqué.'
                    : 'Ajoutez des voyageurs depuis la page Voyageurs.'
              }
            />
          ) : isMobile ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTravelers.map(t => (
                <li
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToTraveler(t.id)}
                  onKeyDown={(e) => rowKeyDown(e, t.id)}
                  style={{
                    padding: '12px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    background: 'var(--surface-1, rgba(255,255,255,0.02))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{t.displayName}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.referenceCode}</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {t.peopleCount} pers.
                    </div>
                  </div>
                  {renderActions(t)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Personnes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTravelers.map(t => (
                    <tr
                      key={t.id}
                      onClick={() => goToTraveler(t.id)}
                      onKeyDown={(e) => rowKeyDown(e, t.id)}
                      tabIndex={0}
                      role="button"
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.displayName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.referenceCode}</div>
                      </td>
                      <td>{t.peopleCount}</td>
                      <td style={{ textAlign: 'right' }}>{renderActions(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">
              <History size={20} /> Activité récente
            </h2>
          </div>
          {events.length === 0 ? (
            <EmptyState
              icon={History}
              title="Aucune activité"
              description="Les scans apparaîtront ici en temps réel."
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {events.map(event => {
                const traveler = travelers.find(t => t.referenceCode === event.referenceCode);
                const name = traveler ? traveler.displayName : event.referenceCode;
                const time = new Date(event.timestamp).toLocaleTimeString('fr-FR');
                const isCheckin = event.action === 'check_in';
                return (
                  <li key={event.id} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px 0',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}>
                    <div style={{
                      marginTop: '4px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: isCheckin ? 'var(--success)' : 'var(--warning)',
                      boxShadow: isCheckin ? '0 0 8px var(--success)' : 'none'
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <strong>{name}</strong> a été {isCheckin ? 'embarqué(e)' : 'dés-embarqué(e)'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {time}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '88px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-2, rgba(0,0,0,0.85))',
            color: 'var(--white)',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
