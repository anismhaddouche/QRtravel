import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  ArrowLeft, User, Users, Phone, Mail, MessageCircle, Copy,
  QrCode, Hash, MapPin, Building2, FileText, AlertCircle,
  Edit2, Trash2, Save, ChevronDown, ChevronUp,
} from 'lucide-react';
import { buildWhatsAppLink, buildMailtoLink, getTravelerQrLink } from '../utils/share';
import GroupMembersEditor, { emptyMember, validateMembers } from '../components/GroupMembersEditor';

// Only two types are supported now. Legacy 'couple' / 'family' rows are
// rendered as Groupe (a DB migration also converts them on init).
const TYPE_ICONS = { person: User, group: Users };
const TYPE_LABELS = { person: 'Individuel', group: 'Groupe' };
function typeLabelOf(t) { return TYPE_LABELS[t] || (t === 'couple' || t === 'family' ? 'Groupe' : t); }
function typeIconOf(t) { return TYPE_ICONS[t] || (t === 'couple' || t === 'family' ? Users : User); }

export default function TravelerDetails({ role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [traveler, setTraveler] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activityOpen, setActivityOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.getTraveler(id)
      .then(data => { if (!cancelled) setTraveler(data); })
      .catch(err => {
        if (cancelled) return;
        const status = err && err.status;
        setError(status === 404 || status === 403 ? 'NOT_FOUND' : 'GENERIC');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const copyText = async (text, label) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      showToast(label || 'Copié');
    } catch { showToast('Copie impossible'); }
  };

  const handleSaveEdit = async (patch) => {
    await api.updateTraveler(id, patch);
    // Re-fetch so we keep the enriched fields (tripName, agencyName,
    // activity) that the PUT response doesn't include.
    const fresh = await api.getTraveler(id);
    setTraveler(fresh);
    setShowEdit(false);
    showToast('Voyageur mis à jour');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteTraveler(id);
      navigate('/', { replace: true });
    } catch (e) {
      setDeleting(false);
      showToast(e.message || 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div style={{ marginTop: '48px' }}>
        <LoadingState message="Chargement du voyageur..." />
      </div>
    );
  }

  if (error || !traveler) {
    return (
      <div style={{ marginTop: '48px' }}>
        <EmptyState
          icon={AlertCircle}
          title={error === 'NOT_FOUND' ? 'Voyageur introuvable' : 'Erreur de chargement'}
          description={
            error === 'NOT_FOUND'
              ? "Ce voyageur n'existe pas ou n'est pas accessible avec votre compte."
              : 'Une erreur est survenue. Réessayez plus tard.'
          }
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Retour
          </button>
        </div>
      </div>
    );
  }

  const trip = { name: traveler.tripName, date: traveler.tripDate };
  const agencyName = traveler.agencyName;
  const qrLink = getTravelerQrLink(traveler.referenceCode);
  const wa = buildWhatsAppLink({ traveler, trip, qrLink, agencyName });
  const mt = buildMailtoLink({ traveler, trip, qrLink, agencyName });
  const TypeIcon = typeIconOf(traveler.type);
  const typeLabel = typeLabelOf(traveler.type);
  const isSuperAdmin = role === 'super_admin';

  const checkedAt = traveler.checkedInAt
    ? new Date(traveler.checkedInAt).toLocaleString('fr-FR')
    : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <User size={28} style={{ color: 'var(--accent)' }} /> {traveler.displayName}
          </h1>
          <p className="page-subtitle" style={{ fontFamily: 'var(--font-mono)' }}>
            {traveler.referenceCode}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => navigate('/')}>
            <ArrowLeft size={16} /> Tableau de bord
          </button>
          <button className="btn btn-outline" onClick={() => setShowEdit(true)}>
            <Edit2 size={16} /> Modifier
          </button>
          <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
            <Trash2 size={16} /> Supprimer
          </button>
        </div>
      </div>

      <div className="form-grid-2">
        {/* Infos voyageur */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title"><User size={20} /> Informations</h2>
            <StatusBadge status={traveler.status} />
          </div>

          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 16px', margin: 0 }}>
            <Field icon={Hash} label="Code de référence">
              <span style={{ fontFamily: 'var(--font-mono)' }}>{traveler.referenceCode}</span>
            </Field>
            <Field icon={TypeIcon} label="Type">{typeLabel}</Field>
            <Field icon={Users} label="Personnes">{traveler.peopleCount}</Field>
            <Field icon={Phone} label="Téléphone">
              {traveler.phone ? (
                <a href={`tel:${traveler.phone}`} style={{ color: 'var(--accent-light)' }}>{traveler.phone}</a>
              ) : <Muted>—</Muted>}
            </Field>
            <Field icon={Mail} label="Email">
              {traveler.email ? (
                <a href={`mailto:${traveler.email}`} style={{ color: 'var(--accent-light)' }}>{traveler.email}</a>
              ) : <Muted>—</Muted>}
            </Field>
            <Field icon={MapPin} label="Voyage">
              {traveler.tripName || <Muted>—</Muted>}
              {traveler.tripDate ? <span style={{ color: 'var(--text-muted)' }}> — {traveler.tripDate}</span> : null}
            </Field>
            {isSuperAdmin && (
              <Field icon={Building2} label="Agence">
                {traveler.agencyName || <Muted>—</Muted>}
              </Field>
            )}
            {checkedAt && (
              <Field icon={Hash} label="Embarqué le">{checkedAt}</Field>
            )}
            {traveler.notes && (
              <Field icon={FileText} label="Notes">
                <span style={{ whiteSpace: 'pre-wrap' }}>{traveler.notes}</span>
              </Field>
            )}
          </dl>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            {traveler.phone && (
              <a className="btn btn-outline" href={`tel:${traveler.phone}`} title="Appeler">
                <Phone size={16} /> Appeler
              </a>
            )}
            {wa && (
              <a className="btn btn-outline" href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                <MessageCircle size={16} /> WhatsApp
              </a>
            )}
            {mt && (
              <a className="btn btn-outline" href={mt} title="Email">
                <Mail size={16} /> Email
              </a>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => copyText(qrLink || traveler.referenceCode, 'Lien QR copié')}
              title="Copier le lien du QR code"
            >
              <Copy size={16} /> Copier lien QR
            </button>
          </div>
        </div>

        {/* QR code */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title"><QrCode size={20} /> QR code</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <img
              src={qrLink}
              alt={`QR code de ${traveler.displayName}`}
              style={{
                maxWidth: '100%',
                width: '260px',
                height: 'auto',
                background: 'var(--white)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <a
              href={qrLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                wordBreak: 'break-all',
                textAlign: 'center',
              }}
            >
              {qrLink}
            </a>
          </div>
        </div>
      </div>

      {/* Membres du groupe — uniquement pour les groupes */}
      {traveler.type === 'group' && (
        <div className="glass-card" style={{ marginTop: '24px' }}>
          <div className="glass-card-header">
            <h2 className="glass-card-title">
              <Users size={20} /> Membres du groupe
              {Array.isArray(traveler.groupMembers) && traveler.groupMembers.length
                ? ` (${traveler.groupMembers.length})`
                : ''}
            </h2>
          </div>
          {!Array.isArray(traveler.groupMembers) || traveler.groupMembers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucun détail membre renseigné"
              description="Vous pouvez ajouter les noms des membres en cliquant sur Modifier."
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {traveler.groupMembers.map((m, i) => {
                const fullName = [m.firstName, m.lastName].filter(Boolean).join(' ') || `Membre ${i + 1}`;
                return (
                  <li
                    key={i}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: '8px' }}>
                        {i + 1}.
                      </span>
                      {fullName}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {m.phone && <span><Phone size={12} style={{ verticalAlign: 'middle' }} /> {m.phone}</span>}
                      {m.email && <span><Mail size={12} style={{ verticalAlign: 'middle' }} /> {m.email}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Activité du voyageur — pliable */}
      <div className="glass-card" style={{ marginTop: '24px' }}>
        <button
          type="button"
          onClick={() => setActivityOpen(v => !v)}
          aria-expanded={activityOpen}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <h2 className="glass-card-title" style={{ margin: 0 }}>
            <FileText size={20} /> Activité du voyageur
            {traveler.activity?.length ? ` (${traveler.activity.length} derniers événements)` : ''}
          </h2>
          {activityOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {activityOpen && (
          !traveler.activity || traveler.activity.length === 0 ? (
            <div style={{ marginTop: '12px' }}>
              <EmptyState
                icon={FileText}
                title="Aucune activité pour ce voyageur"
                description="Les embarquements et désembarquements apparaîtront ici."
              />
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {traveler.activity.map((ev) => {
                const isCheckin = ev.action === 'check_in';
                const label = isCheckin ? 'Embarqué' : ev.action === 'undo_check_in' ? 'Désembarqué' : ev.action;
                const when = new Date(ev.timestamp).toLocaleString('fr-FR');
                const source = ev.deviceId && ev.deviceId !== 'unknown' ? ev.deviceId : null;
                return (
                  <li key={ev.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '16px',
                    padding: '12px 0', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{
                      marginTop: '6px', width: '10px', height: '10px', borderRadius: '50%',
                      background: isCheckin ? 'var(--success)' : 'var(--warning)',
                      boxShadow: isCheckin ? '0 0 8px var(--success)' : 'none',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {when}{source ? ` · ${source}` : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      <EditTravelerModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        traveler={traveler}
        onSave={handleSaveEdit}
      />

      <Modal
        isOpen={showDelete}
        onClose={() => !deleting && setShowDelete(false)}
        title="Supprimer ce voyageur ?"
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Cette action est irréversible. <strong>{traveler.displayName}</strong> et ses scans seront supprimés.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn btn-outline" onClick={() => setShowDelete(false)} disabled={deleting}>
            Annuler
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            <Trash2 size={16} /> {deleting ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </Modal>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '88px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-2, rgba(0,0,0,0.85))',
            color: 'var(--white)',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function EditTravelerModal({ isOpen, onClose, traveler, onSave }) {
  const initialType = (traveler?.type === 'couple' || traveler?.type === 'family') ? 'group' : (traveler?.type || 'person');
  const initialCount = initialType === 'person'
    ? 1
    : Math.max(2, traveler?.peopleCount || 2);
  const initialMembers = initialType === 'group'
    ? (Array.isArray(traveler?.groupMembers) && traveler.groupMembers.length === initialCount
        ? traveler.groupMembers
        : Array.from({ length: initialCount }, (_, i) => (traveler?.groupMembers?.[i] || emptyMember())))
    : [];
  const [form, setForm] = useState({
    displayName: traveler?.displayName || '',
    type: initialType,
    peopleCount: initialCount,
    phone: traveler?.phone || '',
    email: traveler?.email || '',
    notes: traveler?.notes || '',
    groupMembers: initialMembers,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && traveler) {
      const t = (traveler.type === 'couple' || traveler.type === 'family') ? 'group' : (traveler.type || 'person');
      const count = t === 'person' ? 1 : Math.max(2, traveler.peopleCount || 2);
      const members = t === 'group'
        ? Array.from({ length: count }, (_, i) =>
            (Array.isArray(traveler.groupMembers) ? traveler.groupMembers[i] : null) || emptyMember()
          )
        : [];
      setForm({
        displayName: traveler.displayName || '',
        type: t,
        peopleCount: count,
        phone: traveler.phone || '',
        email: traveler.email || '',
        notes: traveler.notes || '',
        groupMembers: members,
      });
      setError('');
    }
  }, [isOpen, traveler]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Backend enforces "person = 1" and "group >= 2"; we still send a clean value.
      const peopleCount = form.type === 'person'
        ? 1
        : Math.max(2, Number(form.peopleCount) || 2);
      if (form.type === 'group') {
        const memberErr = validateMembers(form.groupMembers, peopleCount);
        if (memberErr) { setError(memberErr); setSaving(false); return; }
      }
      await onSave({
        displayName: form.displayName,
        type: form.type,
        peopleCount,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
        // Always send the field so backend clears it on person, replaces on group.
        groupMembers: form.type === 'group' ? form.groupMembers : null,
      });
    } catch (e) {
      setError(e.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (!traveler) return null;

  return (
    <Modal isOpen={isOpen} onClose={() => !saving && onClose()} title="Modifier le voyageur">
      <form onSubmit={submit}>
        <div className="form-group">
          <label className="form-label">Nom d'affichage</label>
          <input
            required
            className="form-input"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Code de référence</label>
          <input
            className="form-input"
            value={traveler.referenceCode}
            disabled
            title="Le code de référence ne peut pas être modifié"
          />
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-input"
              value={form.type}
              onChange={(e) => {
                const type = e.target.value;
                const peopleCount = type === 'person' ? 1 : Math.max(2, form.peopleCount || 0);
                const groupMembers = type === 'group'
                  ? (form.groupMembers?.length === peopleCount
                      ? form.groupMembers
                      : Array.from({ length: peopleCount }, () => emptyMember()))
                  : [];
                setForm({ ...form, type, peopleCount, groupMembers });
              }}
            >
              <option value="person">Individuel</option>
              <option value="group">Groupe</option>
            </select>
          </div>
          {form.type === 'group' && (
            <div className="form-group">
              <label className="form-label">Nombre de personnes</label>
              <input
                type="number"
                min="2"
                max="100"
                className="form-input"
                value={form.peopleCount}
                onChange={(e) => {
                  const peopleCount = Math.max(2, Math.min(100, parseInt(e.target.value) || 2));
                  setForm({ ...form, peopleCount });
                }}
              />
            </div>
          )}
        </div>
        {form.type === 'group' && (
          <GroupMembersEditor
            peopleCount={form.peopleCount}
            value={form.groupMembers}
            onChange={(groupMembers) => setForm((f) => ({ ...f, groupMembers }))}
          />
        )}
        <div className="form-group">
          <label className="form-label">Téléphone</label>
          <input
            className="form-input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="05....."
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-input"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        {error && (
          <div style={{ color: 'var(--danger-light)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ icon: Icon, label, children }) {
  return (
    <>
      <dt style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
        <Icon size={14} /> {label}
      </dt>
      <dd style={{ margin: 0, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
        {children}
      </dd>
    </>
  );
}

function Muted({ children }) {
  return <span style={{ color: 'var(--text-muted)' }}>{children}</span>;
}
