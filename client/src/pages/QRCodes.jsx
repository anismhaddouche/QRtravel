import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { LoadingState } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { QrCode, User, Users, Users2, Printer } from 'lucide-react';

const TYPE_ICONS = { person: User, couple: Users, family: Users2, group: Users };
const TYPE_LABELS = { person: 'Individuel', couple: 'Couple', family: 'Famille', group: 'Groupe' };

export default function QRCodes({ tripId, trip }) {
  const [qrCodes, setQrCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const data = await api.getQRCodes(tripId);
        setQrCodes(data);
      } catch (e) {
        console.error('Failed to load QR codes:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [tripId]);

  if (!tripId) {
    return (
      <div style={{ marginTop: '48px' }}>
        <EmptyState 
          icon={QrCode}
          title="Aucun voyage sélectionné"
          description="Sélectionnez un voyage pour générer et imprimer les codes QR de ses voyageurs."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"><QrCode size={28} className="text-accent" /> Codes QR</h1>
          </div>
        </div>
        <LoadingState message="Génération des codes QR..." />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><QrCode size={28} style={{ color: 'var(--accent)' }} /> Codes QR</h1>
          <p className="page-subtitle">
            {qrCodes.length} codes — {trip?.name || 'Voyage'} — prêts à l'impression
          </p>
        </div>
        <button className="btn btn-primary no-print" onClick={() => window.print()}>
          <Printer size={18} /> Imprimer tout
        </button>
      </div>

      {qrCodes.length === 0 ? (
        <EmptyState 
          icon={QrCode}
          title="Aucun code QR"
          description="Il n'y a pas encore de voyageurs dans ce voyage. Ajoutez-en d'abord pour générer leurs codes QR."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {qrCodes.map(qr => {
            const Icon = TYPE_ICONS[qr.type] || User;
            return (
              <div key={qr.id} className="glass-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div style={{ background: 'white', padding: '12px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px' }}>
                  <img src={qr.dataUrl} alt={`QR code for ${qr.referenceCode}`} style={{ width: '160px', height: '160px', display: 'block' }} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '4px' }}>{qr.displayName}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{qr.referenceCode}</div>
                
                <span className="badge badge-neutral" style={{ display: 'inline-flex', gap: '6px' }}>
                  <Icon size={14} />
                  {TYPE_LABELS[qr.type]} • {qr.peopleCount} p.
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
