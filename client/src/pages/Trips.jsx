import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Map, Plus, Edit2, Trash2, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TRIP_LIMIT = 3;
const TRIP_LIMIT_MESSAGE = 'Limite atteinte : cette agence a déjà 3 voyages. Supprimez un voyage existant avant d\'en créer un nouveau.';

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
  const [showLimit, setShowLimit] = useState(false);

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
      if (err && err.code === 'TRIP_LIMIT_REACHED') {
        setShowForm(false);
        setShowLimit(true);
      } else {
        setFormError(err.message);
      }
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
          <Button
            onClick={() => {
              if (trips.length >= TRIP_LIMIT) {
                setShowLimit(true);
                return;
              }
              setShowForm(true);
              resetForm();
            }}
            id="btn-add-trip"
            title={trips.length >= TRIP_LIMIT ? TRIP_LIMIT_MESSAGE : 'Créer un nouveau voyage'}
          >
            <Plus /> Nouveau voyage
          </Button>
        </div>
      </div>

      {/* Sur mobile, on affiche un bouton de déconnexion car la sidebar n'est pas là */}
      {onLogout && (
        <div className="mb-6 flex justify-end">
          <Button variant="outline" onClick={onLogout}>
            <LogOut /> Déconnexion
          </Button>
        </div>
      )}

      {/* Sélecteur mobile du voyage actif */}
      {trips.length > 0 && window.innerWidth < 1024 && (
        <div className="glass-card mb-6 space-y-2">
          <Label htmlFor="mobile-trip-select">Voyage actif pour cette session</Label>
          <Select
            value={selectedTripId || ''}
            onValueChange={(id) => onSelectTrip(id)}
          >
            <SelectTrigger id="mobile-trip-select" className="w-full">
              <SelectValue placeholder="— Sélectionner un voyage —" />
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
      )}

      {/* Trip Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editingId ? 'Modifier le voyage' : 'Nouveau voyage'}
      >
        {formError && <div className="form-error mb-4">{formError}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="input-trip-name">Nom du voyage *</Label>
            <Input
              id="input-trip-name"
              placeholder="ex: Tournée de Barcelone"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="input-trip-date">Date</Label>
              <Input
                id="input-trip-date"
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="select-trip-status">Statut</Label>
              <Select
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
              >
                <SelectTrigger id="select-trip-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="completed">Terminé</SelectItem>
                  <SelectItem value="archived">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="input-trip-notes">Notes (optionnel)</Label>
            <Textarea
              id="input-trip-notes"
              rows={3}
              placeholder="Détails du voyage, notes pour le guide..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
            <Button type="submit" id="btn-save-trip">
              {editingId ? 'Enregistrer' : 'Créer le voyage'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showLimit}
        onClose={() => setShowLimit(false)}
        title="Limite de voyages atteinte"
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <AlertCircle size={18} style={{ color: 'var(--warning-light)', flexShrink: 0, marginTop: '2px' }} />
          <span>{TRIP_LIMIT_MESSAGE}</span>
        </p>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setShowLimit(false)}>J'ai compris</Button>
        </div>
      </Modal>

      {/* Trip List */}
      {trips.length === 0 ? (
        <EmptyState
          icon={Map}
          title="Aucun voyage pour le moment"
          description="Commencez par créer votre premier voyage pour gérer vos passagers."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus /> Créer un voyage
            </Button>
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
                  <Button
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={() => onSelectTrip(trip.id)}
                  >
                    {isSelected ? "Voyage actif" : "Sélectionner"}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleEdit(trip)}
                      aria-label={`Modifier ${trip.name}`}
                    >
                      <Edit2 />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteConfirm(trip)}
                      aria-label={`Supprimer ${trip.name}`}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
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
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDelete(deleteConfirm.id)}
            id="btn-confirm-delete-trip"
          >
            <Trash2 /> Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
