import { useState, useEffect, useCallback } from 'react';
import { api, getActiveAgencyId, setActiveAgencyId } from '../utils/api';
import Modal from '../components/Modal';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Building2, Plus, Trash2, Pencil, CheckCircle2, XCircle, Eye } from 'lucide-react';

const EMPTY_FORM = { name: '', email: '', phone: '', adminEmail: '', adminPassword: '', adminPasswordConfirm: '' };

export default function Agencies() {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeId, setActiveId] = useState(() => getActiveAgencyId());

  const fetchAgencies = useCallback(async () => {
    try {
      setError('');
      const data = await api.getAgencies();
      setAgencies(data);
    } catch (e) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgencies(); }, [fetchAgencies]);

  const startCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(''); setShowForm(true); };
  const startEdit = (ag) => {
    setEditing(ag);
    setForm({ name: ag.name || '', email: ag.email || '', phone: ag.phone || '' });
    setFormError(''); setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');
    if (!form.name.trim()) { setFormError('Nom requis'); return; }

    if (editing) {
      setSubmitting(true);
      try {
        await api.updateAgency(editing.id, {
          name: form.name, email: form.email, phone: form.phone,
        });
        setShowForm(false); setForm(EMPTY_FORM); setEditing(null);
        await fetchAgencies();
      } catch (err) {
        setFormError(err.message || 'Échec');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Create flow: validate admin fields
    const aEmail = form.adminEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aEmail)) {
      setFormError('Email admin invalide'); return;
    }
    if (form.adminPassword.length < 8) {
      setFormError('Mot de passe admin : 8 caractères minimum'); return;
    }
    if (form.adminPassword !== form.adminPasswordConfirm) {
      setFormError('Les mots de passe ne correspondent pas'); return;
    }
    setSubmitting(true);
    try {
      const result = await api.createAgencyWithAdmin({
        agency: { name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null },
        admin:  { email: aEmail, password: form.adminPassword },
      });
      setShowForm(false); setForm(EMPTY_FORM);
      setSuccessMessage(`Agence « ${result.agency.name} » créée avec l’admin ${result.admin.email}.`);
      await fetchAgencies();
    } catch (err) {
      setFormError(err.message || 'Échec');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (ag) => {
    try {
      await api.updateAgency(ag.id, { status: ag.status === 'active' ? 'inactive' : 'active' });
      await fetchAgencies();
    } catch (err) { alert(err.message || 'Échec'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteAgency(id);
      setDeleteConfirm(null);
      if (activeId === id) { setActiveAgencyId(null); setActiveId(null); }
      await fetchAgencies();
    } catch (err) {
      alert(err.message || 'Suppression échouée');
    }
  };

  const handleSelectAgency = (id) => {
    const next = activeId === id ? null : id;
    setActiveAgencyId(next);
    setActiveId(next);
  };

  if (loading) return <LoadingState message="Chargement des agences..." />;

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Building2 size={28} />
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Agences</h1>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>
          <Plus size={18} /> Nouvelle agence
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {successMessage && (
        <div className="glass-card" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)', padding: '12px 16px', marginBottom: '16px' }}>
          {successMessage}
        </div>
      )}

      {agencies.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} />}
          title="Aucune agence"
          description="Créez votre première agence pour commencer."
        />
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {agencies.map((a, idx) => {
            const isActive = activeId === a.id;
            return (
              <div
                key={a.id}
                className="action-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '16px 20px',
                  borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none',
                  background: isActive ? 'var(--navy-surface)' : 'transparent',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: a.status === 'active' ? 'var(--accent)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                }}>
                  <Building2 size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {a.name} {isActive && <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>· active</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {a.email || '—'} · {a.userCount ?? 0} utilisateurs · {a.tripCount ?? 0} voyages · {a.travelerCount ?? 0} voyageurs
                    {' · '}{a.status}
                  </div>
                </div>
                <div className="row-actions" style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-sm"
                    title={isActive ? "Désélectionner" : "Sélectionner pour inspection"}
                    onClick={() => handleSelectAgency(a.id)}
                  >
                    <Eye size={16} />
                  </button>
                  <button className="btn btn-sm" title="Modifier" onClick={() => startEdit(a)}>
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn btn-sm"
                    title={a.status === 'active' ? 'Désactiver' : 'Activer'}
                    onClick={() => handleToggleStatus(a)}
                  >
                    {a.status === 'active' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    title="Supprimer"
                    onClick={() => setDeleteConfirm(a)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal isOpen={true} title={editing ? `Modifier : ${editing.name}` : 'Nouvelle agence'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Nom</label>
              <input
                className="form-input" type="text" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                autoFocus required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input" type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Téléphone</label>
              <input
                className="form-input" type="tel" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            {!editing && (
              <>
                <h4 style={{ marginTop: '24px', marginBottom: '8px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                  Administrateur de l’agence
                </h4>
                <div className="form-group">
                  <label className="form-label">Email admin</label>
                  <input
                    className="form-input" type="email" value={form.adminEmail}
                    onChange={e => setForm({ ...form, adminEmail: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mot de passe</label>
                  <input
                    className="form-input" type="text" value={form.adminPassword}
                    onChange={e => setForm({ ...form, adminPassword: e.target.value })}
                    minLength={8} required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmation mot de passe</label>
                  <input
                    className="form-input" type="text" value={form.adminPasswordConfirm}
                    onChange={e => setForm({ ...form, adminPasswordConfirm: e.target.value })}
                    minLength={8} required
                  />
                </div>
              </>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? 'Enregistrement...' : (editing ? 'Enregistrer' : 'Créer l’agence + admin')}
            </button>
          </form>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal isOpen={true} title="Supprimer cette agence ?" onClose={() => setDeleteConfirm(null)}>
          <p>
            Supprimer <strong>{deleteConfirm.name}</strong> ? Cette action est irréversible.
            L'agence ne peut être supprimée que si elle ne contient ni utilisateurs, ni voyages, ni voyageurs.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="btn" onClick={() => setDeleteConfirm(null)} style={{ flex: 1 }}>Annuler</button>
            <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)} style={{ flex: 1 }}>
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
