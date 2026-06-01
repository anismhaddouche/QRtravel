import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import {
  ArrowLeft, User, Users, Phone, Mail, MessageCircle, Copy,
  QrCode, Hash, MapPin, Building2, FileText, AlertCircle,
  Edit2, Trash2, Save, ChevronDown, ChevronUp,
} from 'lucide-react';

const PERSON_NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ'’\- ]{2,50}$/u;
const PHONE_RE = /^\+?[\d][\d\s.\-]{7,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTES_UI = 500;

function splitDisplayName(displayName) {
  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function validateEditForm({ firstName, lastName, phone, email, notes }) {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  if (!fn || !PERSON_NAME_RE.test(fn)) return 'Le prénom contient des caractères non autorisés ou est invalide (2 à 50 caractères).';
  if (!ln || !PERSON_NAME_RE.test(ln)) return 'Le nom contient des caractères non autorisés ou est invalide (2 à 50 caractères).';
  if (phone) {
    const p = phone.trim();
    const digits = p.replace(/\D/g, '');
    if (!PHONE_RE.test(p) || digits.length < 8 || digits.length > 15) {
      return 'Numéro de téléphone invalide.';
    }
  }
  if (email) {
    const e = email.trim().toLowerCase();
    if (e.length > 120 || !EMAIL_RE.test(e)) return 'Email invalide.';
  }
  if (notes && notes.length > MAX_NOTES_UI) return `Les notes ne doivent pas dépasser ${MAX_NOTES_UI} caractères.`;
  return null;
}
import { buildWhatsAppLink, buildMailtoLink, getTravelerQrLink } from '../utils/share';
import GroupMembersEditor, { emptyMember, validateMembers } from '../components/GroupMembersEditor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft /> Retour
          </Button>
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

  const isGroup = traveler.type === 'group' || traveler.type === 'couple' || traveler.type === 'family';

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/')}
        className="mb-3"
      >
        <ArrowLeft /> Retour au tableau de bord
      </Button>

      <section className="detail-hero detail-hero--compact">
        <div className="detail-hero__body">
          <div className="detail-hero__name">{traveler.displayName}</div>
          {isGroup && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
              <span className="traveler-row__chip chip-success" style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>
                <Users size={11} /> Groupe · {traveler.peopleCount} pers.
              </span>
            </div>
          )}
        </div>
        <div className="detail-hero__actions detail-hero__actions--icons">
          <Button
            variant="outline"
            size="icon"
            className="detail-hero__action-btn"
            onClick={() => setShowEdit(true)}
            aria-label="Modifier le voyageur"
            title="Modifier"
          >
            <Edit2 />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="detail-hero__action-btn"
            onClick={() => setShowDelete(true)}
            aria-label="Supprimer le voyageur"
            title="Supprimer"
          >
            <Trash2 />
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Infos voyageur */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title"><User size={20} /> Informations</h2>
            <StatusBadge status={traveler.status} />
          </div>

          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 16px', margin: 0 }}>
            {isGroup && (
              <>
                <Field icon={TypeIcon} label="Type">{typeLabel}</Field>
                <Field icon={Users} label="Personnes">{traveler.peopleCount}</Field>
              </>
            )}
            <Field icon={Phone} label="Téléphone">
              {traveler.phone ? (
                <a href={`tel:${traveler.phone}`} className="traveler-info-link">{traveler.phone}</a>
              ) : <Muted>—</Muted>}
            </Field>
            <Field icon={Mail} label="Email">
              {traveler.email ? (
                <a href={`mailto:${traveler.email}`} className="traveler-info-link">{traveler.email}</a>
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
            {wa ? (
              <Button asChild variant="outline" className="traveler-action-button">
                <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled className="traveler-action-disabled" title="Téléphone manquant pour WhatsApp">
                <MessageCircle /> WhatsApp
              </Button>
            )}
            {mt ? (
              <Button asChild variant="outline" className="traveler-action-button">
                <a href={mt} title="Email">
                  <Mail /> Email
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled className="traveler-action-disabled" title="Email manquant">
                <Mail /> Email
              </Button>
            )}
            <Button
              variant="outline"
              className="traveler-action-button"
              onClick={() => { if (qrLink) copyText(qrLink, 'Lien QR copié'); }}
              disabled={!qrLink}
              title="Copier le lien du QR code"
            >
              <Copy /> Copier lien QR
            </Button>
          </div>
        </div>

        {/* QR code */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title"><QrCode size={20} /> QR code</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div className="qr-frame">
              <img
                src={qrLink}
                alt={`QR code de ${traveler.displayName}`}
                style={{ display: 'block', maxWidth: '100%', width: '240px', height: 'auto' }}
              />
            </div>
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
                const memberInit = (fullName || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || (i + 1);
                return (
                  <li key={i} className="member-card">
                    <span className="avatar avatar--sm avatar--neutral">{memberInit}</span>
                    <div className="member-card__body">
                      <div className="member-card__name">{fullName}</div>
                      {(m.phone || m.email) && (
                        <div className="member-card__contacts">
                          {m.phone && <span><Phone size={12} /> {m.phone}</span>}
                          {m.email && <span><Mail size={12} /> {m.email}</span>}
                        </div>
                      )}
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
            <ol className="timeline" style={{ listStyle: 'none' }}>
              {traveler.activity.map((ev) => {
                const isCheckin = ev.action === 'check_in';
                const label = isCheckin ? 'Embarqué' : ev.action === 'undo_check_in' ? 'Désembarqué' : ev.action;
                const when = new Date(ev.timestamp).toLocaleString('fr-FR');
                const source = ev.deviceId && ev.deviceId !== 'unknown' ? ev.deviceId : null;
                return (
                  <li key={ev.id} className="timeline__item">
                    <span className={`timeline__dot ${isCheckin ? 'timeline__dot--success' : 'timeline__dot--warning'}`} />
                    <div className="timeline__title">{label}</div>
                    <div className="timeline__meta">{when}{source ? ` · ${source}` : ''}</div>
                  </li>
                );
              })}
            </ol>
          )
        )}
      </div>

      <EditTravelerModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        traveler={traveler}
        onSave={handleSaveEdit}
      />

      <Dialog
        open={showDelete}
        onOpenChange={(open) => { if (!open && !deleting) setShowDelete(false); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce voyageur ?</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. <strong>{traveler.displayName}</strong> et ses scans seront supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 /> {deleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  const initialNames = splitDisplayName(traveler?.displayName);
  const [form, setForm] = useState({
    firstName: initialNames.firstName,
    lastName: initialNames.lastName,
    type: initialType,
    peopleCount: initialCount,
    peopleCountInput: String(initialCount),
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
      const names = splitDisplayName(traveler.displayName);
      setForm({
        firstName: names.firstName,
        lastName: names.lastName,
        type: t,
        peopleCount: count,
        peopleCountInput: String(count),
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
    const formErr = validateEditForm(form);
    if (formErr) { setError(formErr); return; }
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
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open && !saving) onClose(); }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le voyageur</DialogTitle>
          <DialogDescription className="sr-only">
            Édition des informations du voyageur.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-first-name">Prénom *</Label>
              <Input
                id="edit-first-name"
                required
                maxLength={50}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-last-name">Nom *</Label>
              <Input
                id="edit-last-name"
                required
                maxLength={50}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(type) => {
                  const peopleCount = type === 'person' ? 1 : Math.max(2, form.peopleCount || 2);
                  const groupMembers = type === 'group'
                    ? (form.groupMembers?.length === peopleCount
                        ? form.groupMembers
                        : Array.from({ length: peopleCount }, () => emptyMember()))
                    : [];
                  setForm({
                    ...form,
                    type,
                    peopleCount,
                    peopleCountInput: String(peopleCount),
                    groupMembers,
                  });
                }}
              >
                <SelectTrigger id="edit-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Individuel</SelectItem>
                  <SelectItem value="group">Groupe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === 'group' && (
              <div className="grid gap-2">
                <Label htmlFor="edit-people-count">Nombre de personnes</Label>
                <Input
                  id="edit-people-count"
                  type="number"
                  min="2"
                  max="100"
                  value={form.peopleCountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((f) => {
                      const parsed = parseInt(raw, 10);
                      const valid = Number.isFinite(parsed) && parsed >= 2 && parsed <= 100;
                      const peopleCount = valid ? parsed : f.peopleCount;
                      const groupMembers = valid && parsed !== f.groupMembers.length
                        ? Array.from({ length: parsed }, (_, i) => f.groupMembers[i] || emptyMember())
                        : f.groupMembers;
                      return { ...f, peopleCountInput: raw, peopleCount, groupMembers };
                    });
                  }}
                  onBlur={() => {
                    setForm((f) => {
                      const parsed = parseInt(f.peopleCountInput, 10);
                      const norm = Number.isFinite(parsed) && parsed >= 2
                        ? Math.min(100, parsed)
                        : 2;
                      const groupMembers = norm !== f.groupMembers.length
                        ? Array.from({ length: norm }, (_, i) => f.groupMembers[i] || emptyMember())
                        : f.groupMembers;
                      return {
                        ...f,
                        peopleCount: norm,
                        peopleCountInput: String(norm),
                        groupMembers,
                      };
                    });
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
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">Téléphone</Label>
            <Input
              id="edit-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="05....."
              maxLength={20}
              inputMode="tel"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              maxLength={500}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {error && (
            <div style={{ color: 'var(--danger-light)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              <Save /> {saving ? 'Sauvegarde...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
