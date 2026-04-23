import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { LoadingState } from '../components/Skeleton';
import { Users, User, Users2, Search, Plus, Edit2, Trash2, QrCode, CornerUpLeft, Check } from 'lucide-react';

const TYPE_ICONS = { person: User, couple: Users, family: Users2, group: Users };
const TYPE_LABELS = { person: 'Individuel', couple: 'Couple', family: 'Famille', group: 'Groupe' };

export default function TravelerList({ tripId, lastMessage, trip }) {
  const [travelers, setTravelers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, person, couple, family, group
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
      setFormError('Le code de référence et le nom sont requis');
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
      alert('Erreur lors de la suppression : ' + err.message);
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
      <div style={{ marginTop: '48px' }}>
        <EmptyState 
          icon={Users}
          title="Aucun voyage sélectionné"
          description="Sélectionnez un voyage dans le menu ou créez-en un nouveau pour gérer les voyageurs."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"><Users size={28} className="text-accent" /> Voyageurs</h1>
          </div>
        </div>
        <LoadingState message="Chargement des voyageurs..." />
      </div>
    );
  }

  const totalPeople = travelers.reduce((sum, t) => sum + t.peopleCount, 0);

  let filtered = travelers;
  
  if (filter !== 'all') {
    filtered = filtered.filter(t => t.type === filter);
  }
  
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t => 
      t.displayName.toLowerCase().includes(q) ||
      t.referenceCode.toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q)
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><Users size={28} style={{ color: 'var(--accent)' }} /> Voyageurs</h1>
          <p className="page-subtitle">{travelers.length} unités • {totalPeople} personnes — {trip?.name || 'Voyage'}</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => { setShowForm(true); resetForm(); }} 
          id="btn-add-traveler"
        >
          <Plus size={18} /> Ajouter un voyageur
        </button>
      </div>

      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <Search size={18} />
            </div>
            <input
              className="form-input"
              style={{ paddingLeft: '44px' }}
              type="search"
              placeholder="Rechercher par nom, code ou notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              id="input-traveler-search"
            />
          </div>
        </div>
        
        {/* Quick Filters */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginTop: '16px', paddingBottom: '4px' }}>
          <button 
            className={`badge ${filter === 'all' ? 'badge-success' : 'badge-neutral'}`}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
            onClick={() => setFilter('all')}
          >
            Tous
          </button>
          <button 
            className={`badge ${filter === 'person' ? 'badge-success' : 'badge-neutral'}`}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
            onClick={() => setFilter('person')}
          >
            <User size={14} /> Individuels
          </button>
          <button 
            className={`badge ${filter === 'couple' ? 'badge-success' : 'badge-neutral'}`}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
            onClick={() => setFilter('couple')}
          >
            <Users size={14} /> Couples
          </button>
          <button 
            className={`badge ${filter === 'family' ? 'badge-success' : 'badge-neutral'}`}
            style={{ cursor: 'pointer', padding: '6px 12px' }}
            onClick={() => setFilter('family')}
          >
            <Users2 size={14} /> Familles
          </button>
        </div>
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editingId ? 'Modifier le voyageur' : 'Nouveau voyageur'}
      >
        {formError && <div className="form-error">{formError}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom d'affichage *</label>
            <input
              className="form-input" 
              placeholder="ex: Jean Dupont"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              required
              id="input-traveler-name"
            />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Code de référence *</label>
              <input
                className="form-input" 
                placeholder="ex: TRV-011"
                value={form.referenceCode}
                onChange={e => setForm({ ...form, referenceCode: e.target.value.toUpperCase() })}
                required 
                disabled={!!editingId}
                id="input-traveler-code"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select 
                className="form-select" 
                value={form.type}
                onChange={e => {
                  const type = e.target.value;
                  const count = type === 'person' ? 1 : type === 'couple' ? 2 : 3;
                  setForm({ ...form, type, peopleCount: count });
                }}
                id="select-traveler-type"
              >
                <option value="person">Individuel</option>
                <option value="couple">Couple</option>
                <option value="family">Famille</option>
                <option value="group">Groupe</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nombre de personnes</label>
            <input 
              type="number" 
              className="form-input" 
              min="1" max="50" 
              value={form.peopleCount}
              onChange={e => setForm({ ...form, peopleCount: parseInt(e.target.value) || 1 })}
              id="input-traveler-count"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optionnel)</label>
            <input 
              className="form-input" 
              placeholder="Régimes alimentaires, accessibilité, etc."
              value={form.notes} 
              onChange={e => setForm({ ...form, notes: e.target.value })}
              id="input-traveler-notes"
            />
          </div>
          <div className="flex justify-between mt-4">
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" id="btn-save-traveler">
              {editingId ? 'Enregistrer' : 'Ajouter le voyageur'}
            </button>
          </div>
        </form>
      </Modal>

      {/* List */}
      {travelers.length === 0 ? (
        <EmptyState 
          icon={Users}
          title="Aucun voyageur"
          description="Ajoutez des voyageurs à ce voyage pour commencer à gérer les embarquements."
          action={
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Ajouter un voyageur
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState 
          icon={Search}
          title="Aucun résultat"
          description="Aucun voyageur ne correspond à votre recherche."
          action={
            <button className="btn btn-outline" onClick={() => { setSearch(''); setFilter('all'); }}>
              Effacer les filtres
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map(t => {
            const Icon = TYPE_ICONS[t.type] || User;
            const isCheckedIn = t.status === 'checked_in';
            return (
              <div key={t.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div className="flex justify-between items-start mb-2">
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{t.displayName}</div>
                  <StatusBadge status={t.status} />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '0.8rem', 
                    background: 'rgba(0,0,0,0.3)', 
                    padding: '2px 8px', 
                    borderRadius: '4px',
                    color: 'var(--text-secondary)'
                  }}>
                    {t.referenceCode}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon size={14} /> {TYPE_LABELS[t.type]} • {t.peopleCount} p.
                  </span>
                </div>

                {t.notes && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', background: 'var(--glass)', padding: '8px', borderRadius: '4px' }}>
                    {t.notes}
                  </div>
                )}
                
                <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="flex gap-2">
                    {isCheckedIn ? (
                      <button className="btn btn-sm btn-outline" onClick={() => handleUndo(t.referenceCode)} title="Annuler l'embarquement">
                        <CornerUpLeft size={14} /> Annuler
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-success" onClick={() => handleManualCheckIn(t.id)} title="Embarquer manuellement">
                        <Check size={14} /> Embarquer
                      </button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <button className="btn-icon" onClick={() => handleEdit(t)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn-icon" onClick={() => setDeleteConfirm(t)} style={{ background: 'transparent', border: 'none', color: 'var(--danger-light)', cursor: 'pointer' }}>
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
        title="Supprimer ce voyageur ?"
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Êtes-vous sûr de vouloir supprimer <strong>"{deleteConfirm?.displayName}"</strong> ({deleteConfirm?.referenceCode}) ?
        </p>
        {deleteConfirm?.status === 'checked_in' && (
          <div style={{ 
            background: 'var(--warning-bg)', 
            border: '1px solid rgba(245, 158, 11, 0.3)', 
            padding: '12px', 
            borderRadius: '8px',
            marginBottom: '16px' 
          }}>
            <p style={{ color: 'var(--warning-light)', fontSize: '0.85rem', margin: 0 }}>
              ⚠️ Ce voyageur a déjà embarqué. Son historique de scan sera également supprimé.
            </p>
          </div>
        )}
        <div className="flex justify-between mt-4">
          <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Annuler</button>
          <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)} id="btn-confirm-delete-traveler">
            <Trash2 size={18} /> Supprimer
          </button>
        </div>
      </Modal>
    </div>
  );
}
