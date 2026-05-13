import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../utils/api';
// html5-qrcode is dynamically imported inside startScanner — keeps it
// out of the main bundle so Dashboard / Trips / Travelers / QR Codes
// don't pay the cost.
import ScanFeedback from '../components/ScanFeedback';
import EmptyState from '../components/EmptyState';
import { ScanLine, Camera, CameraOff, AlertTriangle, ShieldAlert, Check } from 'lucide-react';

// Detect if we're in a secure context (HTTPS or localhost)
function isSecureContext() {
  if (window.isSecureContext !== undefined) return window.isSecureContext;
  const hostname = window.location.hostname;
  return window.location.protocol === 'https:'
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
}

// Detect camera availability
async function detectCameraCapability() {
  if (!isSecureContext()) {
    return { available: false, reason: 'insecure-context' };
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { available: false, reason: 'no-api' };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    if (cameras.length === 0) {
      return { available: false, reason: 'no-camera' };
    }
    return { available: true, cameras: cameras.length };
  } catch {
    return { available: false, reason: 'permission-error' };
  }
}

export default function Scanner({ isOnline, offlineQueue, tripId, trip }) {
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraStatus, setCameraStatus] = useState({ checking: true, available: false, reason: null });
  const scannerRef = useRef(null);
  const processingRef = useRef(false);

  // Check camera capability on mount
  useEffect(() => {
    detectCameraCapability().then(result => {
      setCameraStatus({ checking: false, ...result });
    });
  }, []);

  // Human-readable camera error messages
  const cameraMessage = useMemo(() => {
    if (cameraStatus.checking || cameraStatus.available) return null;
    switch (cameraStatus.reason) {
      case 'insecure-context':
        return {
          icon: ShieldAlert,
          title: 'HTTPS requis pour la caméra',
          message: `L'accès à la caméra nécessite une connexion HTTPS ou localhost. Ouvrez l'application via HTTPS pour utiliser la caméra.`,
          tip: 'Utilisez la saisie manuelle ci-dessous comme alternative.',
        };
      case 'no-api':
        return {
          icon: CameraOff,
          title: 'Caméra non supportée',
          message: 'Ce navigateur ne supporte pas l\'accès à la caméra. Utilisez un navigateur récent comme Chrome ou Safari.',
          tip: 'Utilisez la saisie manuelle ci-dessous.',
        };
      case 'no-camera':
        return {
          icon: CameraOff,
          title: 'Aucune caméra détectée',
          message: 'Aucune caméra n\'a été détectée sur cet appareil.',
          tip: 'Utilisez la saisie manuelle ci-dessous, ou essayez sur un autre appareil.',
        };
      case 'permission-error':
        return {
          icon: AlertTriangle,
          title: 'Permission refusée',
          message: 'L\'accès à la caméra a été bloqué. Vérifiez les paramètres de votre navigateur pour autoriser l\'accès.',
          tip: 'Rechargez la page et autorisez l\'accès à la caméra.',
        };
      default:
        return {
          icon: CameraOff,
          title: 'Caméra indisponible',
          message: 'Impossible d\'accéder à la caméra.',
          tip: 'Utilisez la saisie manuelle ci-dessous.',
        };
    }
  }, [cameraStatus]);

  const handleScan = useCallback(async (referenceCode) => {
    if (processingRef.current) return;
    if (lastScanned && lastScanned.code === referenceCode && Date.now() - lastScanned.time < 4000) return;

    processingRef.current = true;
    setLastScanned({ code: referenceCode, time: Date.now() });

    // ONLINE-FIRST: try API directly
    try {
      const result = await api.checkIn(referenceCode, tripId, offlineQueue.deviceId);
      setFeedback({ type: 'success', title: 'Embarqué avec succès', message: result.traveler.displayName });
    } catch (err) {
      if (err.code === 'ALREADY_CHECKED_IN') {
        setFeedback({ type: 'duplicate', title: 'Déjà embarqué', message: err.data?.traveler?.displayName || referenceCode });
      } else if (err.code === 'UNKNOWN_CODE') {
        setFeedback({ type: 'error', title: 'Code invalide', message: `"${referenceCode}" non trouvé dans ce voyage` });
      } else {
        // OFFLINE FALLBACK
        const validation = offlineQueue.validateOffline(referenceCode);
        if (!validation.valid) {
          if (validation.reason === 'ALREADY_CHECKED_IN') {
            setFeedback({ type: 'duplicate', title: 'Déjà embarqué (cache)', message: validation.traveler?.displayName || referenceCode });
          } else if (validation.reason === 'ALREADY_QUEUED') {
            setFeedback({ type: 'duplicate', title: 'Déjà en file d\'attente', message: `${validation.traveler?.displayName || referenceCode} est en attente de synchro` });
          } else {
            offlineQueue.addToQueue(referenceCode, 'check_in');
            setFeedback({ type: 'warning', title: 'Mis en file d\'attente', message: `${referenceCode} — impossible de valider hors ligne` });
          }
        } else {
          offlineQueue.addToQueue(referenceCode, 'check_in');
          setFeedback({ type: 'success', title: 'Embarqué (Hors ligne)', message: `${validation.traveler.displayName} — sera synchronisé plus tard` });
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [offlineQueue, lastScanned, tripId]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    if (!tripId) {
      setFeedback({ type: 'error', title: 'Aucun voyage', message: 'Sélectionnez un voyage avant de scanner.' });
      return;
    }
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      console.error('Scanner start error:', err);
      scannerRef.current = null;

      // Provide specific error messages
      const errStr = typeof err === 'string' ? err : String(err?.message || err);
      if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
        setCameraStatus({ checking: false, available: false, reason: 'permission-error' });
      } else if (errStr.includes('NotFoundError') || errStr.includes('no camera')) {
        setCameraStatus({ checking: false, available: false, reason: 'no-camera' });
      } else if (!isSecureContext()) {
        setCameraStatus({ checking: false, available: false, reason: 'insecure-context' });
      } else {
        setFeedback({ type: 'error', title: 'Erreur Caméra', message: errStr || 'Impossible de démarrer la caméra.' });
      }
    }
  }, [handleScan, tripId]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) {}
      scannerRef.current = null;
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!tripId) {
      setFeedback({ type: 'error', title: 'Aucun voyage', message: 'Sélectionnez un voyage avant de scanner.' });
      return;
    }
    if (manualCode.trim()) {
      handleScan(manualCode.trim().toUpperCase());
      setManualCode('');
    }
  };

  // No trip selected
  if (!tripId) {
    return (
      <div style={{ marginTop: '48px' }}>
        <EmptyState 
          icon={ScanLine}
          title="Aucun voyage sélectionné"
          description="Sélectionnez un voyage dans le menu pour commencer à scanner les codes QR."
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="text-center" style={{ marginBottom: '24px' }}>
        <h1 className="page-title justify-center"><ScanLine size={28} style={{ color: 'var(--accent)' }} /> Scanner</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{trip?.name || 'Voyage'}</span>
          {trip?.date && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--glass)', padding: '2px 8px', borderRadius: '4px' }}>{trip.date}</span>}
        </div>
      </div>

      {/* Offline queue banner */}
      {offlineQueue.queueLength > 0 && (
        <div style={{ 
          background: offlineQueue.syncStatus === 'syncing' ? 'var(--accent-glowStrong)' : 'var(--warning-bg)',
          border: `1px solid ${offlineQueue.syncStatus === 'syncing' ? 'var(--accent)' : 'rgba(245, 158, 11, 0.3)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: offlineQueue.syncStatus === 'syncing' ? 'var(--accent-light)' : 'var(--warning-light)',
          fontSize: '0.85rem',
          fontWeight: 500,
          marginBottom: '20px'
        }}>
          <span style={{ flex: 1 }}>
            {offlineQueue.syncStatus === 'syncing'
              ? `⟳ Synchronisation de ${offlineQueue.queueLength} scan(s)...`
              : `⏳ ${offlineQueue.queueLength} scan(s) en attente`}
          </span>
          {isOnline && offlineQueue.syncStatus !== 'syncing' && (
            <button className="btn btn-sm btn-primary" onClick={offlineQueue.syncQueue}>Synchroniser</button>
          )}
        </div>
      )}

      {/* Camera error message (HTTPS, permissions, etc.) */}
      {cameraMessage && (
        <div className="glass-card" style={{ borderColor: 'var(--warning-light)', textAlign: 'center', marginBottom: '24px' }}>
          <cameraMessage.icon size={48} style={{ color: 'var(--warning-light)', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning-light)', marginBottom: '8px' }}>{cameraMessage.title}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>{cameraMessage.message}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>💡 {cameraMessage.tip}</p>
        </div>
      )}

      {/* Camera viewport — only show if camera is available */}
      {!cameraMessage && (
        <>
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            maxWidth: '400px', 
            margin: '0 auto 24px', 
            borderRadius: 'var(--radius-lg)', 
            overflow: 'hidden',
            border: scanning ? '2px solid var(--accent)' : '1px solid var(--border)',
            boxShadow: scanning ? 'var(--shadow-glow)' : 'var(--shadow-md)',
            background: 'var(--navy-surface)',
            aspectRatio: '1/1'
          }}>
            <div id="qr-reader" style={{ width: '100%', height: '100%' }}></div>
            
            {/* Animated scanning frame when active */}
            {scanning && (
              <div style={{
                position: 'absolute',
                inset: '20px',
                border: '2px dashed rgba(99, 102, 241, 0.5)',
                borderRadius: '12px',
                pointerEvents: 'none',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}>
                <div style={{ position: 'absolute', width: '100%', height: '2px', background: 'var(--accent)', top: '50%', boxShadow: '0 0 10px var(--accent)', animation: 'scan 2s linear infinite' }} />
              </div>
            )}
            
            <style>{`
              @keyframes scan {
                0% { transform: translateY(-100px); opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translateY(100px); opacity: 0; }
              }
            `}</style>

            {!scanning && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                backgroundColor: 'rgba(10, 15, 30, 0.8)',
                backdropFilter: 'blur(4px)'
              }}>
                <Camera size={48} strokeWidth={1.5} />
                <p>Appuyez sur "Démarrer" pour scanner</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
            {!scanning ? (
              <button className="btn btn-primary btn-lg" onClick={startScanner} id="btn-start-camera" style={{ width: '100%', maxWidth: '300px' }}>
                <Camera size={20} /> Démarrer la caméra
              </button>
            ) : (
              <button className="btn btn-danger btn-lg" onClick={stopScanner} id="btn-stop-camera" style={{ width: '100%', maxWidth: '300px' }}>
                <CameraOff size={20} /> Arrêter la caméra
              </button>
            )}
          </div>
        </>
      )}

      {/* Manual code entry — always available */}
      <div className="glass-card">
        <h3 className="glass-card-title" style={{ marginBottom: '8px' }}>Saisie manuelle</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Entrez le code de référence pour valider l'embarquement sans caméra.
        </p>
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text" 
            className="form-input" 
            placeholder="ex: TRV-001"
            value={manualCode} 
            onChange={(e) => setManualCode(e.target.value)}
            style={{ flex: 1, fontFamily: 'var(--font-mono)' }} 
            id="input-manual-code" 
            autoComplete="off"
          />
          <button type="submit" className="btn btn-success" disabled={!manualCode.trim()} id="btn-manual-checkin">
            <Check size={18} /> Valider
          </button>
        </form>
      </div>

      <ScanFeedback result={feedback} onDismiss={() => setFeedback(null)} />
    </div>
  );
}
