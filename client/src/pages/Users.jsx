import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Users as UsersIcon, Plus, Trash2, KeyRound, Shield, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UsersIcon size={28} />
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Comptes</h1>
        </div>
        <Button onClick={() => { setForm(emptyForm(isSuperAdmin)); setFormError(''); setShowForm(true); }}>
          <Plus /> Nouveau compte
        </Button>
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
                className="action-row"
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
                <div className="row-actions flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Réinitialiser le mot de passe"
                    aria-label={`Réinitialiser le mot de passe de ${u.email}`}
                    onClick={() => { setResetTarget(u); setResetPassword(''); setResetError(''); }}
                  >
                    <KeyRound />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    title="Supprimer"
                    aria-label={`Supprimer ${u.email}`}
                    disabled={currentUsername && u.email.toLowerCase() === String(currentUsername).toLowerCase()}
                    onClick={() => setDeleteConfirm(u)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal isOpen={true} title="Nouveau compte" onClose={() => { setShowForm(false); setFormError(''); }}>
          <form onSubmit={handleCreate} className="grid gap-5">
            {formError && <div className="form-error">{formError}</div>}
            <div className="grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-password">Mot de passe</Label>
              <Input
                id="user-password"
                type="text"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-role">Rôle</Label>
              <Select
                value={form.role}
                onValueChange={(role) => setForm({ ...form, role })}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agency_admin">Administrateur d&apos;agence</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super administrateur</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && form.role !== 'super_admin' && (
              <div className="grid gap-2">
                <Label htmlFor="user-agency">Agence</Label>
                <Select
                  value={form.agencyId || ''}
                  onValueChange={(agencyId) => setForm({ ...form, agencyId })}
                >
                  <SelectTrigger id="user-agency" className="w-full">
                    <SelectValue placeholder="— Sélectionner une agence —" />
                  </SelectTrigger>
                  <SelectContent>
                    {agencies.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Création...' : 'Créer'}
            </Button>
          </form>
        </Modal>
      )}

      {resetTarget && (
        <Modal isOpen={true} title={`Réinitialiser : ${resetTarget.email}`} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleReset} className="grid gap-5">
            {resetError && <div className="form-error">{resetError}</div>}
            <div className="grid gap-2">
              <Label htmlFor="reset-password">Nouveau mot de passe</Label>
              <Input
                id="reset-password"
                type="text"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                minLength={8}
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">
                Toutes les sessions actives de cet utilisateur seront déconnectées.
              </p>
            </div>
            <Button type="submit" className="w-full">Réinitialiser</Button>
          </form>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal isOpen={true} title="Supprimer ce compte ?" onClose={() => setDeleteConfirm(null)}>
          <p>
            Supprimer définitivement <strong>{deleteConfirm.email}</strong> ? Cette action est irréversible.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(deleteConfirm.id)}
            >
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
