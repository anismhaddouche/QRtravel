import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import StatusBadge from '../components/StatusBadge';

const TYPE_ICONS = { person: '👤', couple: '💑', family: '👨‍👩‍👧‍👦', group: '👥' };

export default function TravelerList({ tripId, lastMessage, trip }) {
  const [travelers, setTravelers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    referenceCode: '', displayName: '', type: 'person', peopleCount: 1, notes: '',
  });
  const [formError, setFormError] = useState('');

  const fetchTravelers = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await api.getTravelers(tripId);
      setTravelers(data);
    } catch (e) {
      console.error('Failed to fetch travelers:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { fetchTravelers(); }, [fetchTravelers]);
  useEffect(() => { if (lastMessage) fetchTravelers(); }, [lastMessage, fetchTravelers]);

  const resetForm = () => {
    setForm({ referenceCode: '', displayName: '', type: 'person', peopleCount: 1, notes: '' });
    setFormError('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.referenceCode || !form.displayName) {
      setFormError('Reference code and display name are required');
      return;
    }

    try {
      if (editingId) {
        await api.updateTraveler(editingId, form);
      } else {
        await api.createTraveler({ ...form, tripId });
      }
      setShowForm(false);
      resetForm();
      fetchTravelers();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEdit = (t) => {
    setForm({
      referenceCode: t.referenceCode,
      displayName: t.displayName,
      type: t.type,
      peopleCount: t.peopleCount,
      notes: t.notes || '',
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleUndo = async (referenceCode) => {
    try { await api.undoCheckIn(referenceCode); fetchTravelers(); } catch (err) { alert(err.message); }
  };

  const handleManualCheckIn = async (travelerId) => {
    try { await api.manualCheckIn(travelerId); fetchTravelers(); } catch (err) { alert(err.message); }
  };

  if (!tripId) {
    return (
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">📋</div><p>No trip selected.</p>
      </div></div>
    );
  }

  if (loading) {
    return (
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">⏳</div><p>Loading travelers...</p>
      </div></div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 Travelers</h1>
          <p className="page-subtitle">{travelers.length} units — {trip?.name || 'Trip'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
          {showForm ? '✕ Cancel' : '+ Add Traveler'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 className="card-title" style={{ marginBottom: '16px' }}>
            {editingId ? 'Edit Traveler' : 'New Traveler Unit'}
          </h3>
          {formError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '12px' }}>❌ {formError}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Reference Code</label>
                <input
                  className="form-input" placeholder="e.g. TRV-011"
                  value={form.referenceCode}
                  onChange={e => setForm({ ...form, referenceCode: e.target.value.toUpperCase() })}
                  required disabled={!!editingId}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  className="form-input" placeholder="e.g. John Smith"
                  value={form.displayName}
                  onChange={e => setForm({ ...form, displayName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type}
                  onChange={e => {
                    const type = e.target.value;
                    const count = type === 'person' ? 1 : type === 'couple' ? 2 : 3;
                    setForm({ ...form, type, peopleCount: count });
                  }}
                >
                  <option value="person">👤 Person</option>
                  <option value="couple">💑 Couple</option>
                  <option value="family">👨‍👩‍👧‍👦 Family</option>
                  <option value="group">👥 Group</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">People Count</label>
                <input type="number" className="form-input" min="1" max="50" value={form.peopleCount}
                  onChange={e => setForm({ ...form, peopleCount: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" placeholder="Dietary needs, accessibility, etc."
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-success" style={{ marginTop: '8px' }}>
              {editingId ? '💾 Save Changes' : '✓ Create Traveler'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <table className="traveler-table">
          <thead>
            <tr>
              <th>Name</th><th>Code</th><th>Type</th><th>People</th>
              <th>Status</th><th>Checked In</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {travelers.map(t => (
              <tr key={t.id}>
                <td>
                  <div className="traveler-name">{t.displayName}</div>
                  {t.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.notes}</div>}
                </td>
                <td><span className="traveler-ref">{t.referenceCode}</span></td>
                <td><span className="type-icon">{TYPE_ICONS[t.type]}</span> {t.type}</td>
                <td>{t.peopleCount}</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="traveler-time">{t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString() : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {t.status === 'checked_in' ? (
                      <button className="btn btn-sm btn-outline" onClick={() => handleUndo(t.referenceCode)}>↩ Undo</button>
                    ) : (
                      <button className="btn btn-sm btn-success" onClick={() => handleManualCheckIn(t.id)}>✓ Check In</button>
                    )}
                    <button className="btn btn-sm btn-outline" onClick={() => handleEdit(t)}>✏️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
