import { useState, useEffect, useCallback } from 'react';
import { api, getActiveAgencyId, setActiveAgencyId } from '../utils/api';
import Modal from '../components/Modal';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { Building2, Plus, Trash2, Pencil, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const EMPTY_FORM = { name: '', email: '', phone: '', adminEmail: '', adminPassword: '', adminPasswordConfirm: '' };

// Strong-confirm modal for agency deletion. Requires the operator to
// type the agency name AND check the irreversible-action box before
// the destructive button activates. Handles both empty-agency and
// force-purge paths.
function DeleteAgencyModal({ agency, onClose, onDelete }) {
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const hasData =
    (agency.userCount || 0) + (agency.tripCount || 0) + (agency.travelerCount || 0) > 0;
  const nameMatches = typed.trim().toLowerCase() === agency.name.trim().toLowerCase();
  const canSubmit = nameMatches && acknowledged && !submitting;

  const submit = async () => {
    setError(''); setSubmitting(true);
    try {
      await onDelete(agency, { force: hasData });
    } catch (err) {
      setError(err.message || 'Suppression échouée');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} title={`Supprimer ${agency.name}`} onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      {hasData ? (
        <>
          <p>
            Cette agence contient <strong>{agency.userCount || 0}</strong> compte(s),{' '}
            <strong>{agency.tripCount || 0}</strong> voyage(s) et{' '}
            <strong>{agency.travelerCount || 0}</strong> voyageur(s).
          </p>
          <p style={{ color: 'var(--warning-light)' }}>
            La suppression supprimera définitivement toutes ces données ainsi que
            tous les historiques de scan et sessions liés. Aucun super_admin ne
            sera supprimé.
          </p>
        </>
      ) : (
        <p>Cette agence est vide. La suppression est définitive.</p>
      )}

      <div className="mt-3 space-y-2">
        <Label htmlFor="confirm-agency-name">
          Pour confirmer, tapez le nom de l’agence : <strong>{agency.name}</strong>
        </Label>
        <Input
          id="confirm-agency-name"
          type="text"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          autoFocus
          autoComplete="off"
        />
      </div>

      <div className="flex items-center gap-2 my-4">
        <Checkbox
          id="ack-irreversible"
          checked={acknowledged}
          onCheckedChange={(v) => setAcknowledged(v === true)}
        />
        <Label htmlFor="ack-irreversible" className="font-normal">
          Je comprends que cette action est irréversible.
        </Label>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={submitting} className="sm:flex-none">
          Annuler
        </Button>
        <Button
          variant="destructive"
          disabled={!canSubmit}
          onClick={submit}
          className="sm:flex-none"
        >
          {submitting ? 'Suppression...' : (hasData ? 'Tout supprimer' : 'Supprimer')}
        </Button>
      </div>
    </Modal>
  );
}

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
    } catch (err) {
      setError(err.message || 'Échec');
    }
  };

  const performDelete = async (ag, { force }) => {
    const result = await api.deleteAgency(ag.id, { force });
    if (activeId === ag.id) { setActiveAgencyId(null); setActiveId(null); }
    setDeleteConfirm(null);
    await fetchAgencies();
    setSuccessMessage(`Agence « ${ag.name} » supprimée${force ? ' avec toutes ses données' : ''}.`);
    return result;
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
        <Button onClick={startCreate}>
          <Plus /> Nouvelle agence
        </Button>
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
                <div className="row-actions flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={isActive ? "Désélectionner" : "Sélectionner pour inspection"}
                    aria-label={isActive ? `Désélectionner ${a.name}` : `Sélectionner ${a.name}`}
                    onClick={() => handleSelectAgency(a.id)}
                  >
                    <Eye />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Modifier"
                    aria-label={`Modifier ${a.name}`}
                    onClick={() => startEdit(a)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={a.status === 'active' ? 'Désactiver' : 'Activer'}
                    aria-label={a.status === 'active' ? `Désactiver ${a.name}` : `Activer ${a.name}`}
                    onClick={() => handleToggleStatus(a)}
                  >
                    {a.status === 'active' ? <XCircle /> : <CheckCircle2 />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    title="Supprimer"
                    aria-label={`Supprimer ${a.name}`}
                    onClick={() => setDeleteConfirm(a)}
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
        <Modal isOpen={true} title={editing ? `Modifier : ${editing.name}` : 'Nouvelle agence'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave} className="space-y-5">
            {formError && <div className="form-error">{formError}</div>}
            <div className="space-y-2">
              <Label htmlFor="agency-name">Nom</Label>
              <Input
                id="agency-name"
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency-email">Email</Label>
              <Input
                id="agency-email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency-phone">Téléphone</Label>
              <Input
                id="agency-phone"
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            {!editing && (
              <>
                <h4 className="mt-6 mb-2 text-sm text-muted-foreground">
                  Administrateur de l’agence
                </h4>
                <div className="space-y-2">
                  <Label htmlFor="agency-admin-email">Email admin</Label>
                  <Input
                    id="agency-admin-email"
                    type="email"
                    value={form.adminEmail}
                    onChange={e => setForm({ ...form, adminEmail: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agency-admin-password">Mot de passe</Label>
                  <Input
                    id="agency-admin-password"
                    type="text"
                    value={form.adminPassword}
                    onChange={e => setForm({ ...form, adminPassword: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agency-admin-password-confirm">Confirmation mot de passe</Label>
                  <Input
                    id="agency-admin-password-confirm"
                    type="text"
                    value={form.adminPasswordConfirm}
                    onChange={e => setForm({ ...form, adminPasswordConfirm: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Enregistrement...' : (editing ? 'Enregistrer' : 'Créer l’agence + admin')}
            </Button>
          </form>
        </Modal>
      )}

      {deleteConfirm && (
        <DeleteAgencyModal
          agency={deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onDelete={performDelete}
        />
      )}
    </div>
  );
}
