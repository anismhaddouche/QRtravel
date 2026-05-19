import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { LoadingState } from '../components/Skeleton';
import { Users, User, Users2, Search, Plus, Edit2, Trash2, QrCode, CornerUpLeft, Check, Upload, Phone, Mail, MessageCircle, Send, Copy, X } from 'lucide-react';
import { onActiveAgencyChange } from '../utils/api';
import { buildWhatsAppLink, buildMailtoLink, getTravelerQrLink } from '../utils/share';

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
    referenceCode: '', displayName: '', type: 'person', peopleCount: 1, notes: '', phone: '', email: '',
  });
  const [formError, setFormError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  // ─── Multi-select state ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [shareMode, setShareMode] = useState(null); // null | 'whatsapp' | 'email'
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [toast, setToast] = useState('');

  // Reset selection on trip change
  useEffect(() => { setSelectedIds(new Set()); }, [tripId]);
  // Reset selection on super-admin active-agency change
  useEffect(() => {
    const off = onActiveAgencyChange(() => setSelectedIds(new Set()));
    return off;
  }, []);

  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = (ids) => setSelectedIds(new Set(ids));
  const clearSelection = () => setSelectedIds(new Set());

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const copyRef = async (referenceCode) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(referenceCode);
      showToast(`Code ${referenceCode} copié`);
    } catch { showToast('Copie impossible'); }
  };

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
    setForm({ referenceCode: '', displayName: '', type: 'person', peopleCount: 1, notes: '', phone: '', email: '' });
    setFormError('');
    setEditingId(null);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    setImportResult(null);
    if (file.size > 1024 * 1024) {
      setImportError('Fichier trop volumineux (max 1 Mo).');
      return;
    }
    try {
      setImporting(true);
      const text = await file.text();
      const result = await api.importTravelersCsv(tripId, text);
      setImportResult(result);
      fetchTravelers();
    } catch (err) {
      setImportError(err.message || 'Échec de l\'import');
    } finally {
      setImporting(false);
    }
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
      phone: t.phone || '',
      email: t.email || '',
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleDelete = async (traveler) => {
    try {
      await api.deleteTraveler(traveler.id);
      setDeleteConfirm(null);
      setSelectedIds(prev => {
        if (!prev.has(traveler.id)) return prev;
        const next = new Set(prev); next.delete(traveler.id); return next;
      });
      fetchTravelers();
    } catch (err) {
      setDeleteConfirm(null);
      showToast('Erreur lors de la suppression : ' + err.message);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleteError('');
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { setShowBulkDelete(false); return; }
    try {
      setBulkDeleting(true);
      const result = await api.bulkDeleteTravelers(ids);
      setShowBulkDelete(false);
      clearSelection();
      showToast(`${result.deleted} voyageur(s) supprimé(s)${result.skipped ? `, ${result.skipped} ignoré(s)` : ''}`);
      fetchTravelers();
    } catch (err) {
      setBulkDeleteError(err.message || 'Échec de la suppression');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleUndo = async (referenceCode) => {
    try { await api.undoCheckIn(referenceCode, tripId); fetchTravelers(); } catch (err) { alert(err.message); }
  };

  const handleManualCheckIn = async (travelerId) => {
    try { await api.manualCheckIn(travelerId, tripId); fetchTravelers(); } catch (err) { alert(err.message); }
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
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            onClick={() => { setShowImport(true); setImportResult(null); setImportError(''); }}
            id="btn-import-travelers"
          >
            <Upload size={18} /> Importer CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setShowForm(true); resetForm(); }}
            id="btn-add-traveler"
          >
            <Plus size={18} /> Ajouter un voyageur
          </button>
        </div>
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

      {/* Selection helpers row */}
      {travelers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => selectAllVisible(filtered.map(t => t.id))}
            disabled={filtered.length === 0}
          >
            Sélectionner tout ({filtered.length})
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
          >
            Tout désélectionner
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {selectedIds.size} sélectionné(s)
          </span>
        </div>
      )}

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
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Téléphone (optionnel)</label>
              <input
                className="form-input"
                type="tel"
                placeholder="ex: 0612345678"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                maxLength={30}
                id="input-traveler-phone"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email (optionnel)</label>
              <input
                className="form-input"
                type="email"
                placeholder="ex: jean@example.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                maxLength={255}
                id="input-traveler-email"
              />
            </div>
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
              <div
                key={t.id}
                className="glass-card"
                style={{
                  padding: '20px', display: 'flex', flexDirection: 'column',
                  border: selectedIds.has(t.id) ? '2px solid var(--accent)' : undefined,
                }}
              >
                <div className="flex justify-between items-start mb-2" style={{ gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      aria-label={`Sélectionner ${t.displayName}`}
                      style={{ width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.displayName}
                    </span>
                  </label>
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

                {(t.phone || t.email) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {t.phone && (
                      <a href={`tel:${t.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
                        <Phone size={14} /> {t.phone}
                      </a>
                    )}
                    {t.email && (
                      <a href={`mailto:${t.email}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none', wordBreak: 'break-all' }}>
                        <Mail size={14} /> {t.email}
                      </a>
                    )}
                  </div>
                )}

                {t.notes && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', background: 'var(--glass)', padding: '8px', borderRadius: '4px' }}>
                    {t.notes}
                  </div>
                )}
                
                {/* Quick actions: call / whatsapp / mail / copy ref */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {t.phone && (
                    <a className="btn btn-sm btn-outline" href={`tel:${t.phone}`} title="Appeler">
                      <Phone size={14} />
                    </a>
                  )}
                  {(() => {
                    const wa = buildWhatsAppLink({ traveler: t, trip, qrLink: getTravelerQrLink(t.referenceCode) });
                    return wa ? (
                      <a className="btn btn-sm btn-outline" href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                        <MessageCircle size={14} />
                      </a>
                    ) : null;
                  })()}
                  {(() => {
                    const mt = buildMailtoLink({ traveler: t, trip, qrLink: getTravelerQrLink(t.referenceCode) });
                    return mt ? (
                      <a className="btn btn-sm btn-outline" href={mt} title="Email">
                        <Mail size={14} />
                      </a>
                    ) : null;
                  })()}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => copyRef(t.referenceCode)}
                    title="Copier le code de référence"
                  >
                    <Copy size={14} />
                  </button>
                </div>

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

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImport}
        onClose={() => { setShowImport(false); setImportResult(null); setImportError(''); }}
        title="Importer des voyageurs (CSV)"
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
          Le fichier doit contenir les colonnes : <strong>type, nom, prenom, tel, mail</strong>.<br />
          Séparateur accepté : virgule (,) ou point-virgule (;). Max 500 lignes, 1 Mo.
        </p>
        <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
{`type,nom,prenom,tel,mail
Individuel,Dupont,Karim,0555555555,karim@example.com
Individuel,Benali,Sara,0666666666,sara@example.com`}
        </pre>

        {importError && <div className="form-error" style={{ marginTop: '12px' }}>{importError}</div>}

        {importResult && (
          <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'var(--glass)' }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {importResult.created} voyageur(s) créé(s), {importResult.failed} en erreur.
            </div>
            {importResult.errors && importResult.errors.length > 0 && (
              <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--danger-light)', maxHeight: '200px', overflowY: 'auto' }}>
                {importResult.errors.map((er, i) => (
                  <li key={i}>Ligne {er.line} — {er.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label">Fichier CSV</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            disabled={importing}
            id="input-csv-file"
            className="form-input"
          />
        </div>

        <div className="flex justify-between mt-4">
          <button
            className="btn btn-outline"
            onClick={() => { setShowImport(false); setImportResult(null); setImportError(''); }}
            disabled={importing}
          >
            Fermer
          </button>
          {importing && (
            <span style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}>Import en cours…</span>
          )}
        </div>
      </Modal>

      {/* Bulk delete confirmation */}
      <Modal
        isOpen={showBulkDelete}
        onClose={() => { if (!bulkDeleting) { setShowBulkDelete(false); setBulkDeleteError(''); } }}
        title={`Supprimer ${selectedIds.size} voyageur(s) ?`}
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Cette action est irréversible. Les historiques de scan associés seront également supprimés.
        </p>
        {bulkDeleteError && <div className="form-error">{bulkDeleteError}</div>}
        <div className="flex justify-between mt-4">
          <button className="btn btn-outline" onClick={() => setShowBulkDelete(false)} disabled={bulkDeleting}>Annuler</button>
          <button
            className="btn btn-danger"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            id="btn-confirm-bulk-delete"
          >
            <Trash2 size={18} /> {bulkDeleting ? 'Suppression…' : `Supprimer (${selectedIds.size})`}
          </button>
        </div>
      </Modal>

      {/* Share modal (WhatsApp / Email) */}
      <Modal
        isOpen={!!shareMode}
        onClose={() => setShareMode(null)}
        title={shareMode === 'whatsapp' ? 'Envoyer QR par WhatsApp' : shareMode === 'email' ? 'Envoyer QR par email' : ''}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>
          {shareMode === 'whatsapp'
            ? 'Cliquez sur "Ouvrir" pour chaque voyageur — WhatsApp s\'ouvrira avec un message pré-rempli.'
            : 'Cliquez sur "Ouvrir" pour chaque voyageur — votre client mail s\'ouvrira avec le message pré-rempli.'}
        </p>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {travelers
            .filter(t => selectedIds.has(t.id))
            .map(t => {
              const qrLink = getTravelerQrLink(t.referenceCode);
              const link = shareMode === 'whatsapp'
                ? buildWhatsAppLink({ traveler: t, trip, qrLink })
                : buildMailtoLink({ traveler: t, trip, qrLink });
              const missing = shareMode === 'whatsapp' ? !t.phone : !t.email;
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '8px', padding: '10px', background: 'var(--glass)', borderRadius: '8px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.displayName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {shareMode === 'whatsapp'
                        ? (t.phone || <em>Téléphone manquant</em>)
                        : (t.email || <em>Email manquant</em>)}
                    </div>
                  </div>
                  {link ? (
                    <a
                      className="btn btn-sm btn-primary"
                      href={link}
                      target={shareMode === 'whatsapp' ? '_blank' : undefined}
                      rel={shareMode === 'whatsapp' ? 'noopener noreferrer' : undefined}
                    >
                      <Send size={14} /> Ouvrir
                    </a>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>Non disponible</span>
                  )}
                </div>
              );
            })}
        </div>
        <div className="flex justify-between mt-4">
          <button className="btn btn-outline" onClick={() => setShareMode(null)}>Fermer</button>
        </div>
      </Modal>

      {/* Sticky action bar — visible only when at least one selected */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Actions sélection"
          style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            marginTop: '24px',
            padding: '12px 16px',
            background: 'var(--glass)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            zIndex: 50,
          }}
        >
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {selectedIds.size} sélectionné(s)
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" onClick={clearSelection} title="Tout désélectionner">
              <X size={14} /> Désélectionner
            </button>
            <button className="btn btn-sm btn-outline" onClick={() => setShareMode('whatsapp')}>
              <MessageCircle size={14} /> WhatsApp
            </button>
            <button className="btn btn-sm btn-outline" onClick={() => setShareMode('email')}>
              <Mail size={14} /> Email
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => { setBulkDeleteError(''); setShowBulkDelete(true); }}
              id="btn-bulk-delete"
            >
              <Trash2 size={14} /> Supprimer
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text-primary)',
            color: 'var(--background)',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
