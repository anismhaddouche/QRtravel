import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import StatusBadge from '../components/StatusBadge';

const TYPE_ICONS = { person: '👤', couple: '💑', family: '👨‍👩‍👧‍👦', group: '👥' };

export default function Dashboard({ tripId, lastMessage, trip }) {
  const [stats, setStats] = useState(null);
  const [travelers, setTravelers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!tripId) return;
    try {
      const [statsData, travelersData, eventsData] = await Promise.all([
        api.getStats(tripId),
        api.getTravelers(tripId),
        api.getEvents(10),
      ]);
      setStats(statsData);
      setTravelers(travelersData);
      setEvents(eventsData);
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setLoading(false);
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
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <p>No trip selected. Create a trip first.</p>
      </div></div>
    );
  }

  if (loading) {
    return (
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">⏳</div><p>Loading dashboard...</p>
      </div></div>
    );
  }

  const progress = stats ? Math.round((stats.checkedInUnits / Math.max(stats.totalUnits, 1)) * 100) : 0;
  const missingTravelers = travelers.filter(t => t.status === 'not_checked_in');
  const checkedInTravelers = travelers.filter(t => t.status === 'checked_in');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Dashboard</h1>
          <p className="page-subtitle">
            {trip ? trip.name : 'Trip'} {trip?.date ? `— ${trip.date}` : ''}
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchData}>🔄 Refresh</button>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card accent">
            <div className="stat-label">Total Units</div>
            <div className="stat-value">{stats.totalUnits}</div>
            <div className="stat-sub">{stats.totalPeople} people</div>
          </div>
          <div className="stat-card success">
            <div className="stat-label">Checked In</div>
            <div className="stat-value">{stats.checkedInUnits}</div>
            <div className="stat-sub">{stats.checkedInPeople} people</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-label">Missing</div>
            <div className="stat-value">{stats.missingUnits}</div>
            <div className="stat-sub">{stats.missingPeople} people</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-label">Progress</div>
            <div className="stat-value">{progress}%</div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Missing Travelers */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🔴 Missing ({missingTravelers.length})</h2>
          </div>
          {missingTravelers.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-state-icon">🎉</div>
              <p>Everyone is checked in!</p>
            </div>
          ) : (
            <table className="traveler-table">
              <thead><tr><th>Name</th><th>Type</th><th>People</th></tr></thead>
              <tbody>
                {missingTravelers.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="traveler-name">{t.displayName}</div>
                      <div className="traveler-ref">{t.referenceCode}</div>
                    </td>
                    <td><span className="type-icon">{TYPE_ICONS[t.type]}</span> {t.type}</td>
                    <td>{t.peopleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🕓 Recent Activity</h2>
          </div>
          {events.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-state-icon">📋</div><p>No scans yet</p>
            </div>
          ) : (
            <ul className="activity-list">
              {events.map(event => {
                const traveler = travelers.find(t => t.referenceCode === event.referenceCode);
                const name = traveler ? traveler.displayName : event.referenceCode;
                const time = new Date(event.timestamp).toLocaleTimeString();
                const isCheckin = event.action === 'check_in';
                return (
                  <li key={event.id} className="activity-item">
                    <span className={`activity-dot ${event.action}`}></span>
                    <span className="activity-text">
                      <strong>{name}</strong> — {isCheckin ? 'checked in' : 'check-in undone'}
                    </span>
                    <span className="activity-time">{time}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {checkedInTravelers.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <h2 className="card-title">🟢 Checked In ({checkedInTravelers.length})</h2>
          </div>
          <table className="traveler-table">
            <thead><tr><th>Name</th><th>Type</th><th>People</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>
              {checkedInTravelers.map(t => (
                <tr key={t.id}>
                  <td>
                    <div className="traveler-name">{t.displayName}</div>
                    <div className="traveler-ref">{t.referenceCode}</div>
                  </td>
                  <td><span className="type-icon">{TYPE_ICONS[t.type]}</span> {t.type}</td>
                  <td>{t.peopleCount}</td>
                  <td className="traveler-time">{t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString() : '—'}</td>
                  <td><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
