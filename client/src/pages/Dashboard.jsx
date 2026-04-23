import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import StatusBadge from '../components/StatusBadge';
import { SkeletonStats, SkeletonTable } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Users, UserCheck, UserX, LayoutDashboard, History, RefreshCw, User, Users2 } from 'lucide-react';

const TYPE_ICONS = { person: User, couple: Users, family: Users2, group: Users };

export default function Dashboard({ tripId, lastMessage, trip }) {
  const [stats, setStats] = useState(null);
  const [travelers, setTravelers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const progress = stats ? Math.round((stats.checkedInUnits / Math.max(stats.totalUnits, 1)) * 100) : 0;
  const missingTravelers = travelers.filter(t => t.status === 'not_checked_in');
  const checkedInTravelers = travelers.filter(t => t.status === 'checked_in');

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
          
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Progression</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: progress === 100 ? 'var(--success)' : 'var(--white)' }}>{progress}%</div>
            </div>
            <div className="progress-bar-container" style={{ height: '12px', marginTop: '16px' }}>
              <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      <div className="form-grid-2">
        {/* Missing Travelers */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ color: 'var(--warning-light)' }}>
              <UserX size={20} /> Restants ({missingTravelers.length})
            </h2>
          </div>
          {missingTravelers.length === 0 ? (
            <EmptyState 
              icon={UserCheck}
              title="Tout le monde est là !"
              description="Tous les voyageurs de ce voyage ont embarqué."
            />
          ) : (
            <div className="table-container">
              <table className="glass-table">
                <thead><tr><th>Nom</th><th>Type</th><th>Personnes</th></tr></thead>
                <tbody>
                  {missingTravelers.map(t => {
                    const Icon = TYPE_ICONS[t.type] || User;
                    const typeLabel = t.type === 'person' ? 'Individuel' : t.type === 'couple' ? 'Couple' : t.type === 'family' ? 'Famille' : 'Groupe';
                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.displayName}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.referenceCode}</div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Icon size={16} className="text-secondary" /> 
                            <span style={{ fontSize: '0.85rem' }}>{typeLabel}</span>
                          </div>
                        </td>
                        <td>{t.peopleCount}</td>
                      </tr>
                    );
                  })}
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

      {checkedInTravelers.length > 0 && (
        <div className="glass-card" style={{ marginTop: '24px' }}>
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ color: 'var(--success-light)' }}>
              <UserCheck size={20} /> Embarqués ({checkedInTravelers.length})
            </h2>
          </div>
          <div className="table-container">
            <table className="glass-table">
              <thead><tr><th>Nom</th><th>Type</th><th>Personnes</th><th>Heure</th><th>Statut</th></tr></thead>
              <tbody>
                {checkedInTravelers.map(t => {
                  const Icon = TYPE_ICONS[t.type] || User;
                  const typeLabel = t.type === 'person' ? 'Individuel' : t.type === 'couple' ? 'Couple' : t.type === 'family' ? 'Famille' : 'Groupe';
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.displayName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.referenceCode}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Icon size={16} className="text-secondary" /> 
                          <span style={{ fontSize: '0.85rem' }}>{typeLabel}</span>
                        </div>
                      </td>
                      <td>{t.peopleCount}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString('fr-FR') : '—'}
                      </td>
                      <td><StatusBadge status={t.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
