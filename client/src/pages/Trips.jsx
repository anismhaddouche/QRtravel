import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Map, Plus, Edit2, Trash2, LogOut } from 'lucide-react';

const STATUS_CONFIG = {
  active: { label: 'Actif', className: 'badge-success' },
  completed: { label: 'Terminé', className: 'badge-neutral' },
  archived: { label: 'Archivé', className: 'badge-warning' },
};

export default function Trips({ onTripChange, selectedTripId, onSelectTrip, onLogout }) {
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
      setFormError('Le nom du voyage est requis');
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
      if (selectedTripId === tripId && onSelectTrip) {
        onSelectTrip(null);
      }
    } catch (err) {
      alert('Erreur lors de la suppression du voyage : ' + err.message);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"><Map size={28} className="text-accent" /> Voyages & Destinations</h1>
          </div>
        </div>
        <LoadingState message="Chargement des voyages..." />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><Map size={28} style={{ color: 'var(--accent)' }} /> Voyages & Destinations</h1>
          <p className="page-subtitle">{trips.length} voyage{trips.length !== 1 ? 's' : ''} au total</p>
        </div>
        <div className="flex gap-3">
          <button
            className="btn btn-primary"
            onClick={() => { setShowForm(true); resetForm(); }}
            id="btn-add-trip"
          >
            <Plus size={18} /> Nouveau voyage
          </button>
        </div>
      </div>
      
      {/* Sur mobile, on affiche un bouton de déconnexion car la sidebar n'est pas là */}
      {onLogout && (
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            className="btn btn-outline" 
            onClick={onLogout}
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      )}

      {/* S'il y a des voyages sur mobile, il peut être utile de pouvoir en sélectionner un ici */}
      {trips.length > 0 && window.innerWidth < 1024 && (
        <div className="glass-card" style={{ marginBottom: '24px' }}>
          <label className="form-label">Voyage actif pour cette session</label>
          <select
            className="form-select"
            value={selectedTripId || ''}
            onChange={e => onSelectTrip(e.target.value)}
          >
            {!selectedTripId && <option value="" disabled>— Sélectionner un voyage —</option>}
            {trips.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.date ? `(${t.date})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Trip Form Modal */}
      <Modal 
        isOpen={showForm} 
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editingId ? 'Modifier le voyage' : 'Nouveau voyage'}
      >
        {formError && <div className="form-error">{formError}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom du voyage *</label>
            <input
              className="form-input"
              placeholder="ex: Tournée de Barcelone"
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
            <label className="form-label">Statut</label>
            <select
              className="form-select"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              id="select-trip-status"
            >
              <option value="active">Actif</option>
              <option value="completed">Terminé</option>
              <option value="archived">Archivé</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optionnel)</label>
            <input
              className="form-input"
              placeholder="Détails du voyage, notes pour le guide..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              id="input-trip-notes"
            />
          </div>
          <div className="flex justify-between mt-4">
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" id="btn-save-trip">
              {editingId ? 'Enregistrer' : 'Créer le voyage'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Trip List */}
      {trips.length === 0 ? (
        <EmptyState 
          icon={Map}
          title="Aucun voyage pour le moment"
          description="Commencez par créer votre premier voyage pour gérer vos passagers."
          action={
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Créer un voyage
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {trips.map(trip => {
            const isSelected = trip.id === selectedTripId;
            return (
              <div 
                key={trip.id} 
                className="glass-card"
                style={{ 
                  border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                  boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)'
                }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{trip.name}</h3>
                    {trip.date && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{trip.date}</span>}
                  </div>
                  <span className={`badge ${STATUS_CONFIG[trip.status]?.className || 'badge-neutral'}`}>
                    {STATUS_CONFIG[trip.status]?.label || trip.status}
                  </span>
                </div>

                {trip.notes && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
                    {trip.notes}
                  </p>
                )}

                <div style={{ 
                  display: 'flex', 
                  gap: '24px', 
                  padding: '16px 0', 
                  borderTop: '1px solid var(--border-subtle)', 
                  borderBottom: '1px solid var(--border-subtle)',
                  marginBottom: '16px' 
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{trip.travelerCount || 0}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Unités</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{trip.totalPeople || 0}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Personnes</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success-light)', lineHeight: 1 }}>{trip.checkedInCount || 0}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Embarqués</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <button 
                    className={isSelected ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                    onClick={() => onSelectTrip(trip.id)}
                  >
                    {isSelected ? "Voyage actif" : "Sélectionner"}
                  </button>
                  <div className="flex gap-2">
                    <button className="btn-icon" onClick={() => handleEdit(trip)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn-icon" onClick={() => setDeleteConfirm(trip)} style={{ background: 'transparent', border: 'none', color: 'var(--danger-light)', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Supprimer ce voyage ?"
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Êtes-vous sûr de vouloir supprimer <strong>"{deleteConfirm?.name}"</strong> ?
        </p>
        <div style={{ 
          background: 'var(--danger-bg)', 
          border: '1px solid rgba(239, 68, 68, 0.3)', 
          padding: '12px', 
          borderRadius: '8px',
          marginBottom: '24px' 
        }}>
          <p style={{ color: 'var(--danger-light)', fontSize: '0.85rem', margin: 0 }}>
            ⚠️ Cette action supprimera définitivement tous les voyageurs associés ({deleteConfirm?.travelerCount || 0} unités) et leur historique de scan. Cette action est irréversible.
          </p>
        </div>
        <div className="flex justify-between">
          <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)} id="btn-confirm-delete-trip">
            <Trash2 size={18} /> Supprimer
          </button>
        </div>
      </Modal>
    </div>
  );
}
