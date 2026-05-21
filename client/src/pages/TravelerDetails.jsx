import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import {
  ArrowLeft, User, Users, Phone, Mail, MessageCircle, Copy,
  QrCode, Hash, MapPin, Building2, FileText, AlertCircle,
} from 'lucide-react';
import { buildWhatsAppLink, buildMailtoLink, getTravelerQrLink } from '../utils/share';

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
