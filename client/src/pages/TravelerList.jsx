import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import StatusBadge from '../components/StatusBadge';

const TYPE_ICONS = { person: '👤', couple: '👥', family: '👨‍👩‍👧‍👦', group: '👥' };

export default function TravelerList({ tripId, lastMessage, trip }) {
  const [travelers, setTravelers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState('');
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

  const handleDelete = async (traveler) => {
    try {
      await api.deleteTraveler(traveler.id);
      setDeleteConfirm(null);
      fetchTravelers();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
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
        <div className="empty-state-icon">📋</div>
        <h2 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No Trip Selected</h2>
        <p>Select a trip from the header or <a href="/trips" style={{ color: 'var(--accent-light)' }}>create one</a> to manage travelers.</p>
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

  const totalPeople = travelers.reduce((sum, t) => sum + t.peopleCount, 0);

  const filtered = search.trim()
    ? travelers.filter(t => {
      const q = search.toLowerCase();
      return (
        t.displayName.toLowerCase().includes(q) ||
        t.referenceCode.toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    })
    : travelers;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 Travelers</h1>
          <p className="page-subtitle">{travelers.length} units • {totalPeople} people — {trip?.name || 'Trip'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }} id="btn-add-traveler">
          {showForm ? '✕ Cancel' : '+ Add Traveler'}
        </button>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '16px' }}>
        <input
          className="form-input"
          type="search"
          placeholder="Search traveler..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          id="input-traveler-search"
          style={{ maxWidth: '360px', width: '100%' }}
        />
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 className="card-title" style={{ marginBottom: '16px' }}>
            {editingId ? '✏️ Edit Traveler' : '🆕 New Traveler Unit'}
          </h3>
          {formError && <div className="form-error">❌ {formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Reference Code *</label>
                <input
                  className="form-input" placeholder="e.g. TRV-011"
                  value={form.referenceCode}
                  onChange={e => setForm({ ...form, referenceCode: e.target.value.toUpperCase() })}
                  required disabled={!!editingId}
                  id="input-traveler-code"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display Name *</label>
                <input
                  className="form-input" placeholder="e.g. John Smith"
                  value={form.displayName}
                  onChange={e => setForm({ ...form, displayName: e.target.value })}
                  required
                  id="input-traveler-name"
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
                  id="select-traveler-type"
                >
                  <option value="person">👤 Person</option>
                  <option value="couple">👥 Couple</option>
                  <option value="family">👨‍👩‍👧‍👦 Family</option>
                  <option value="group">👥 Group</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">People Count</label>
                <input type="number" className="form-input" min="1" max="50" value={form.peopleCount}
                  onChange={e => setForm({ ...form, peopleCount: parseInt(e.target.value) || 1 })}
                  id="input-traveler-count"
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" placeholder="Dietary needs, accessibility, etc."
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  id="input-traveler-notes"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-success" style={{ marginTop: '8px' }} id="btn-save-traveler">
              {editingId ? '💾 Save Changes' : '✓ Create Traveler'}
            </button>
          </form>
        </div>
      )}

      {travelers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <h2 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No Travelers Yet</h2>
          <p>Add travelers to this trip to start managing check-ins.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h2 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No travelers found</h2>
          <p>No travelers found for this search.</p>
        </div>
      ) : (
        <div className="card">
          <table className="traveler-table">
            <thead>
              <tr>
                <th>Name</th><th>Code</th><th>Type</th><th>People</th>
                <th>Status</th><th>Checked In</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
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
                    <div className="action-buttons">
                      {t.status === 'checked_in' ? (
                        <button className="btn btn-sm btn-outline" onClick={() => handleUndo(t.referenceCode)}>↩ Undo</button>
                      ) : (
                        <button className="btn btn-sm btn-success" onClick={() => handleManualCheckIn(t.id)}>✓ Check In</button>
                      )}
                      <button className="btn btn-sm btn-outline" onClick={() => handleEdit(t)}>✏️</button>
                      <button className="btn btn-sm btn-danger-outline" onClick={() => setDeleteConfirm(t)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">🗑️ Delete Traveler?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Are you sure you want to delete <strong>"{deleteConfirm.displayName}"</strong> ({deleteConfirm.referenceCode})?
            </p>
            {deleteConfirm.status === 'checked_in' && (
              <p style={{ color: 'var(--warning)', fontSize: '0.85rem', marginBottom: '12px' }}>
                ⚠️ This traveler has been checked in. Their check-in history will also be deleted.
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)} id="btn-confirm-delete-traveler">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
