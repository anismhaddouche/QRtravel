import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const STATUS_CONFIG = {
  active: { label: 'Active', className: 'badge-success' },
  completed: { label: 'Completed', className: 'badge-neutral' },
  archived: { label: 'Archived', className: 'badge-warning' },
};

export default function Trips({ onTripChange }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', date: '', notes: '', status: 'active' });
  const [formError, setFormError] = useState('');

  const fetchTrips = useCallback(async () => {
    try {
      const data = await api.getTrips();
      setTrips(data);
    } catch (e) {
      console.error('Failed to fetch trips:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const resetForm = () => {
    setForm({ name: '', date: '', notes: '', status: 'active' });
    setFormError('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name) {
      setFormError('Trip name is required');
      return;
    }

    try {
      if (editingId) {
        await api.updateTrip(editingId, form);
      } else {
        await api.createTrip(form);
      }
      setShowForm(false);
      resetForm();
      fetchTrips();
      if (onTripChange) onTripChange();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEdit = (trip) => {
    setForm({
      name: trip.name,
      date: trip.date || '',
      notes: trip.notes || '',
      status: trip.status,
    });
    setEditingId(trip.id);
    setShowForm(true);
  };

  const handleDelete = async (tripId) => {
    try {
      await api.deleteTrip(tripId);
      setDeleteConfirm(null);
      fetchTrips();
      if (onTripChange) onTripChange();
    } catch (err) {
      alert('Failed to delete trip: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">⏳</div><p>Loading trips...</p>
      </div></div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🗺️ Trips & Destinations</h1>
          <p className="page-subtitle">{trips.length} trip{trips.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          id="btn-add-trip"
        >
          {showForm ? '✕ Cancel' : '+ New Trip'}
        </button>
      </div>

      {/* Trip Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 className="card-title" style={{ marginBottom: '16px' }}>
            {editingId ? '✏️ Edit Trip' : '🆕 New Trip'}
          </h3>
          {formError && <div className="form-error">❌ {formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Trip Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Barcelona City Tour"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  id="input-trip-name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  id="input-trip-date"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  id="select-trip-status"
                >
                  <option value="active">🟢 Active</option>
                  <option value="completed">✅ Completed</option>
                  <option value="archived">📦 Archived</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input
                  className="form-input"
                  placeholder="Trip details, highlights..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  id="input-trip-notes"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-success" style={{ marginTop: '8px' }} id="btn-save-trip">
              {editingId ? '💾 Save Changes' : '✓ Create Trip'}
            </button>
          </form>
        </div>
      )}

      {/* Trip List */}
      {trips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗺️</div>
          <h2 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No Trips Yet</h2>
          <p>Create your first trip to get started.</p>
        </div>
      ) : (
        <div className="trips-grid">
          {trips.map(trip => (
            <div key={trip.id} className="trip-card card">
              <div className="trip-card-header">
                <div>
                  <h3 className="trip-card-name">{trip.name}</h3>
                  {trip.date && <span className="trip-card-date">📅 {trip.date}</span>}
                </div>
                <span className={`badge ${STATUS_CONFIG[trip.status]?.className || 'badge-neutral'}`}>
                  {STATUS_CONFIG[trip.status]?.label || trip.status}
                </span>
              </div>

              {trip.notes && (
                <p className="trip-card-notes">{trip.notes}</p>
              )}

              <div className="trip-card-stats">
                <div className="trip-stat">
                  <span className="trip-stat-value">{trip.travelerCount || 0}</span>
                  <span className="trip-stat-label">units</span>
                </div>
                <div className="trip-stat">
                  <span className="trip-stat-value">{trip.totalPeople || 0}</span>
                  <span className="trip-stat-label">people</span>
                </div>
                <div className="trip-stat">
                  <span className="trip-stat-value trip-stat-checked">{trip.checkedInCount || 0}</span>
                  <span className="trip-stat-label">checked in</span>
                </div>
              </div>

              <div className="trip-card-actions">
                <button className="btn btn-sm btn-outline" onClick={() => handleEdit(trip)}>
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-sm btn-danger-outline"
                  onClick={() => setDeleteConfirm(trip)}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">🗑️ Delete Trip?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>?
            </p>
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '20px' }}>
              ⚠️ This will permanently delete all associated travelers ({deleteConfirm.travelerCount || 0} units)
              and scan history. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)} id="btn-confirm-delete-trip">
                🗑️ Delete Trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
