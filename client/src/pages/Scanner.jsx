import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../utils/api';
// html5-qrcode is dynamically imported inside startScanner — keeps it
// out of the main bundle so Dashboard / Trips / Travelers / QR Codes
// don't pay the cost.
import ScanFeedback from '../components/ScanFeedback';
import EmptyState from '../components/EmptyState';
import { ScanLine, Camera, CameraOff, AlertTriangle, ShieldAlert, Check, Loader2 } from 'lucide-react';

// Minimum time between two scan submissions. The camera stays running
// the whole time; only QR processing pauses. Tune here.
const SCAN_COOLDOWN_MS = 2000;

function isSecureContext() {
  if (window.isSecureContext !== undefined) return window.isSecureContext;
  const hostname = window.location.hostname;
  return window.location.protocol === 'https:'
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
}

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
  const [manualCode, setManualCode] = useState('');
  const [cameraStatus, setCameraStatus] = useState({ checking: true, available: false, reason: null });

  // Processing lock — covers both the in-flight API call AND the
  // cooldown that follows. While true, all scan/manual submissions
  // are ignored.
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState(0);
  const [processingPhase, setProcessingPhase] = useState('idle'); // 'idle' | 'api' | 'cooldown'

  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  useEffect(() => {
    detectCameraCapability().then(result => {
      setCameraStatus({ checking: false, ...result });
    });
  }, []);

  // Cleanup any pending cooldown timer on unmount.
  useEffect(() => () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

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

  // Begin cooldown after the API call resolves. Camera keeps decoding
  // QR codes; we just drop them while the lock is held.
  const startCooldown = useCallback(() => {
    setProcessingPhase('cooldown');
    const start = Date.now();
    setCooldownRemainingSec(Math.ceil(SCAN_COOLDOWN_MS / 1000));

    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, SCAN_COOLDOWN_MS - elapsed);
      if (remaining <= 0) {
        setCooldownRemainingSec(0);
        processingRef.current = false;
        setIsProcessingScan(false);
        setProcessingPhase('idle');
        cooldownTimerRef.current = null;
        return;
      }
      setCooldownRemainingSec(Math.ceil(remaining / 1000));
      cooldownTimerRef.current = setTimeout(tick, 250);
    };
    cooldownTimerRef.current = setTimeout(tick, 250);
  }, []);

  const handleScan = useCallback(async (referenceCode) => {
    // Single source of truth: the ref. Synchronous and never stale.
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessingScan(true);
    setProcessingPhase('api');

    try {
      const result = await api.checkIn(referenceCode, tripId, offlineQueue.deviceId);
      setFeedback({ type: 'success', title: 'Embarqué avec succès', message: result.traveler.displayName });
    } catch (err) {
      if (err.code === 'ALREADY_CHECKED_IN') {
        setFeedback({ type: 'duplicate', title: 'Déjà embarqué', message: err.data?.traveler?.displayName || referenceCode });
      } else if (err.code === 'UNKNOWN_CODE') {
        setFeedback({ type: 'error', title: 'QR inconnu', message: `"${referenceCode}" non trouvé dans ce voyage` });
      } else if (err.code === 'WRONG_TRIP') {
        setFeedback({ type: 'warning', title: 'QR d’un autre voyage', message: `Ce code n'appartient pas au voyage sélectionné.` });
      } else if (err.code === 'FORBIDDEN_AGENCY_SCOPE') {
        setFeedback({ type: 'error', title: 'QR non autorisé', message: 'Ce code appartient à une autre agence.' });
      } else if (err.status && err.status >= 400 && err.status < 500) {
        // Other client-side rejections from the API — show the server
        // message rather than guessing offline behavior.
        setFeedback({ type: 'error', title: 'Erreur de scan', message: err.message || 'Scan refusé.' });
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
      // Hold the lock through the cooldown window. The camera keeps
      // running; further detections are dropped by the guard above.
      startCooldown();
    }
  }, [offlineQueue, tripId, startCooldown]);

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
        {
          fps: 10,
          // Scale the decode box to ~84% of the viewfinder so it matches
          // the visible reticle on every device width.
          qrbox: (vw, vh) => {
            const edge = Math.floor(Math.min(vw, vh) * 0.84);
            return { width: edge, height: edge };
          },
          aspectRatio: 1,
        },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      console.error('Scanner start error:', err);
      scannerRef.current = null;

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
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) { /* ignore */ }
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
    if (processingRef.current) return; // honor the same lock
    const code = manualCode.trim();
    if (code) {
      handleScan(code.toUpperCase());
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

  // Calm status line shown inside the viewport.
  const statusText = !scanning
    ? null
    : processingPhase === 'api'
      ? 'Traitement du scan…'
      : processingPhase === 'cooldown'
        ? `Prêt pour le prochain scan dans ${cooldownRemainingSec}s…`
        : 'Pointez la caméra vers un code QR';

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
              ? `Synchronisation de ${offlineQueue.queueLength} scan(s)...`
              : `${offlineQueue.queueLength} scan(s) en attente`}
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
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{cameraMessage.tip}</p>
        </div>
      )}

      {/* Camera viewport — calm, field-ready look */}
      {!cameraMessage && (
        <>
          <div style={{
            position: 'relative',
            width: '100%',
            // ~94 vw on phones, capped at 480 px on tablet/desktop.
            maxWidth: 'min(94vw, 480px)',
            margin: '0 auto 20px',
            borderRadius: '24px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.04)',
            // Always dark — camera viewport reads better with a dark inset
            // even in light theme. Intentional design choice.
            background: '#0b1224',
            aspectRatio: '1/1'
          }}>
            <div id="qr-reader" style={{ width: '100%', height: '100%' }}></div>

            {/* Static reticle: four soft corner brackets — no animation.
                Inset 8% → frame covers ~84% of the viewport, matching the
                qrbox area while staying clean and modern. */}
            {scanning && (
              <div style={{ position: 'absolute', inset: '8%', pointerEvents: 'none' }} aria-hidden="true">
                {[
                  { top: 0,    left: 0,    borderTop: true,    borderLeft: true,  radius: 'borderTopLeftRadius' },
                  { top: 0,    right: 0,   borderTop: true,    borderRight: true, radius: 'borderTopRightRadius' },
                  { bottom: 0, left: 0,    borderBottom: true, borderLeft: true,  radius: 'borderBottomLeftRadius' },
                  { bottom: 0, right: 0,   borderBottom: true, borderRight: true, radius: 'borderBottomRightRadius' },
                ].map((c, i) => {
                  const style = {
                    position: 'absolute',
                    width: 36,
                    height: 36,
                    [c.radius]: 8,
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
                  };
                  if (c.top !== undefined) style.top = c.top;
                  if (c.bottom !== undefined) style.bottom = c.bottom;
                  if (c.left !== undefined) style.left = c.left;
                  if (c.right !== undefined) style.right = c.right;
                  const stroke = '2px solid rgba(255, 255, 255, 0.92)';
                  if (c.borderTop) style.borderTop = stroke;
                  if (c.borderBottom) style.borderBottom = stroke;
                  if (c.borderLeft) style.borderLeft = stroke;
                  if (c.borderRight) style.borderRight = stroke;
                  return <span key={i} style={style} />;
                })}
              </div>
            )}

            {/* Status pill — single, unobtrusive line at the bottom */}
            {scanning && statusText && (
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  bottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: 'rgba(10, 15, 30, 0.65)',
                  backdropFilter: 'blur(6px)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                  pointerEvents: 'none',
                }}
                role="status"
                aria-live="polite"
              >
                {processingPhase !== 'idle' && (
                  <Loader2 size={14} style={{ animation: 'spin 1.4s linear infinite' }} />
                )}
                <span>{statusText}</span>
              </div>
            )}

            {/* "Press Start" placeholder when camera is off */}
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

      {/* Manual code entry — also respects the processing lock */}
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
            disabled={isProcessingScan}
          />
          <button
            type="submit"
            className="btn btn-success"
            disabled={!manualCode.trim() || isProcessingScan}
            id="btn-manual-checkin"
            title={isProcessingScan ? 'Traitement en cours…' : ''}
          >
            {isProcessingScan ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1.4s linear infinite' }} />
                {processingPhase === 'cooldown' ? `${cooldownRemainingSec}s` : '…'}
              </>
            ) : (
              <>
                <Check size={18} /> Valider
              </>
            )}
          </button>
        </form>
      </div>

      <ScanFeedback result={feedback} onDismiss={() => setFeedback(null)} />
    </div>
  );
}
