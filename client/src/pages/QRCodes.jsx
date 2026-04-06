import { useState, useEffect } from 'react';
import { api } from '../utils/api';

const TYPE_ICONS = { person: '👤', couple: '💑', family: '👨‍👩‍👧‍👦', group: '👥' };

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
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">📋</div><p>No trip selected.</p>
      </div></div>
    );
  }

  if (loading) {
    return (
      <div className="page"><div className="empty-state">
        <div className="empty-state-icon">⏳</div><p>Generating QR codes...</p>
      </div></div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔲 QR Codes</h1>
          <p className="page-subtitle">
            {qrCodes.length} codes — {trip?.name || 'Trip'} — ready to print
          </p>
        </div>
        <button className="btn btn-primary no-print" onClick={() => window.print()}>
          🖨️ Print All
        </button>
      </div>

      <div className="qr-grid">
        {qrCodes.map(qr => (
          <div key={qr.id} className="qr-card">
            <img src={qr.dataUrl} alt={`QR code for ${qr.referenceCode}`} />
            <div className="qr-name">{qr.displayName}</div>
            <div className="qr-ref">{qr.referenceCode}</div>
            <div className="qr-type" style={{ marginTop: '6px' }}>
              <span className="badge badge-neutral">
                <span className="type-icon">{TYPE_ICONS[qr.type]}</span>
                {qr.type} • {qr.peopleCount} {qr.peopleCount === 1 ? 'person' : 'people'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
