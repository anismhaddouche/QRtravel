import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Users as UsersIcon, Plus, Trash2, KeyRound, Shield, User } from 'lucide-react';

const ROLE_LABEL = {
  super_admin: 'Super administrateur',
  agency_admin: 'Administrateur d’agence',
  admin: 'Administrateur',          // legacy
};

function emptyForm(isSuperAdmin) {
  return {
    email: '',
    password: '',
    role: 'agency_admin',
    agencyId: isSuperAdmin ? '' : null,
  };
}

export default function Users({ currentUsername, currentRole }) {
  const isSuperAdmin = currentRole === 'super_admin';
  const [users, setUsers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyForm(isSuperAdmin));
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      setError('');
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getAgencies().then(setAgencies).catch(() => {});
  }, [isSuperAdmin]);

  const agencyName = (id) => {
    if (!id) return '—';
    const a = agencies.find(x => x.id === id);
    return a ? a.name : id;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.email || !form.password) {
      setFormError('Email et mot de passe requis');
      return;
    }
    if (form.password.length < 8) {
      setFormError('Mot de passe : 8 caractères minimum');
      return;
    }
    if (form.role !== 'super_admin' && isSuperAdmin && !form.agencyId) {
      setFormError('Agence requise');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        email: form.email,
        password: form.password,
        role: form.role,
      };
      if (form.role !== 'super_admin' && isSuperAdmin) payload.agencyId = form.agencyId;
      await api.createUser(payload);
      setForm(emptyForm(isSuperAdmin));
      setShowForm(false);
      await fetchUsers();
    } catch (err) {
      setFormError(err.message || 'Échec de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteUser(id);
      setDeleteConfirm(null);
      await fetchUsers();
    } catch (err) {
      alert(err.message || 'Suppression échouée');
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError('');
    if (resetPassword.length < 8) {
      setResetError('Mot de passe : 8 caractères minimum');
      return;
    }
    try {
      await api.resetUserPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err.message || 'Réinitialisation échouée');
    }
  };

  if (loading) return <LoadingState message="Chargement des utilisateurs..." />;

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UsersIcon size={28} />
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Comptes</h1>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm(isSuperAdmin)); setFormError(''); setShowForm(true); }}>
          <Plus size={18} /> Nouveau compte
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {users.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={48} />}
          title="Aucun compte"
          description="Créez un premier compte pour permettre à votre équipe de se connecter."
        />
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {users.map((u, idx) => {
            const isAdminish = u.role === 'super_admin' || u.role === 'agency_admin' || u.role === 'admin';
            return (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px 20px',
                  borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: isAdminish ? 'var(--accent)' : 'var(--navy-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                }}>
                  {isAdminish ? <Shield size={20} /> : <User size={20} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {ROLE_LABEL[u.role] || u.role}
                    {isSuperAdmin && u.role !== 'super_admin' && (
                      <> · {agencyName(u.agencyId)}</>
                    )}
                    {' · '}créé le {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  title="Réinitialiser le mot de passe"
                  onClick={() => { setResetTarget(u); setResetPassword(''); setResetError(''); }}
                >
                  <KeyRound size={16} />
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  title="Supprimer"
                  disabled={currentUsername && u.email.toLowerCase() === String(currentUsername).toLowerCase()}
                  onClick={() => setDeleteConfirm(u)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title="Nouveau compte" onClose={() => { setShowForm(false); setFormError(''); }}>
          <form onSubmit={handleCreate}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mot de passe</label>
              <input
                className="form-input"
                type="text"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rôle</label>
              <select
                className="form-select"
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
              >
                <option value="agency_admin">Administrateur d&apos;agence</option>
                {isSuperAdmin && <option value="super_admin">Super administrateur</option>}
              </select>
            </div>
            {isSuperAdmin && form.role !== 'super_admin' && (
              <div className="form-group">
                <label className="form-label">Agence</label>
                <select
                  className="form-select"
                  value={form.agencyId || ''}
                  onChange={e => setForm({ ...form, agencyId: e.target.value })}
                  required
                >
                  <option value="">— Sélectionner une agence —</option>
                  {agencies.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? 'Création...' : 'Créer'}
            </button>
          </form>
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Réinitialiser : ${resetTarget.email}`} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleReset}>
            {resetError && <div className="form-error">{resetError}</div>}
            <div className="form-group">
              <label className="form-label">Nouveau mot de passe</label>
              <input
                className="form-input"
                type="text"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                minLength={8}
                autoFocus
                required
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Toutes les sessions actives de cet utilisateur seront déconnectées.
              </p>
            </div>
            <button type="submit" className="btn btn-primary w-full">Réinitialiser</button>
          </form>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title="Supprimer ce compte ?" onClose={() => setDeleteConfirm(null)}>
          <p>
            Supprimer définitivement <strong>{deleteConfirm.email}</strong> ? Cette action est irréversible.
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
