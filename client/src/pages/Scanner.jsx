import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../utils/api';
import ScanFeedback from '../components/ScanFeedback';

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
          icon: '🔒',
          title: 'HTTPS Required for Camera',
          message: `Camera access requires HTTPS or localhost. You're accessing via ${window.location.protocol}//${window.location.host}. Open the app over HTTPS to use the camera on this device.`,
          tip: 'Use manual code entry below as a fallback.',
        };
      case 'no-api':
        return {
          icon: '📵',
          title: 'Camera Not Supported',
          message: 'This browser does not support camera access. Use a modern browser like Chrome or Safari.',
          tip: 'Use manual code entry below.',
        };
      case 'no-camera':
        return {
          icon: '📷',
          title: 'No Camera Found',
          message: 'No camera was detected on this device.',
          tip: 'Use manual code entry below, or try on a device with a camera.',
        };
      case 'permission-error':
        return {
          icon: '🚫',
          title: 'Camera Permission Denied',
          message: 'Camera access was blocked. Check your browser settings to allow camera access for this site.',
          tip: 'Reload the page and allow camera access when prompted.',
        };
      default:
        return {
          icon: '❓',
          title: 'Camera Unavailable',
          message: 'Could not access the camera.',
          tip: 'Use manual code entry below.',
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
      const result = await api.checkIn(referenceCode, offlineQueue.deviceId);
      setFeedback({ type: 'success', title: 'Checked In!', message: result.traveler.displayName });
    } catch (err) {
      if (err.code === 'ALREADY_CHECKED_IN') {
        setFeedback({ type: 'duplicate', title: 'Already Checked In', message: err.data?.traveler?.displayName || referenceCode });
      } else if (err.code === 'UNKNOWN_CODE') {
        setFeedback({ type: 'error', title: 'Unknown QR Code', message: `"${referenceCode}" not found in this trip` });
      } else {
        // OFFLINE FALLBACK
        const validation = offlineQueue.validateOffline(referenceCode);
        if (!validation.valid) {
          if (validation.reason === 'ALREADY_CHECKED_IN') {
            setFeedback({ type: 'duplicate', title: 'Already Checked In (cached)', message: validation.traveler?.displayName || referenceCode });
          } else if (validation.reason === 'ALREADY_QUEUED') {
            setFeedback({ type: 'duplicate', title: 'Already Queued', message: `${validation.traveler?.displayName || referenceCode} is pending sync` });
          } else {
            offlineQueue.addToQueue(referenceCode, 'check_in');
            setFeedback({ type: 'warning', title: 'Queued (Offline)', message: `${referenceCode} — cannot validate offline` });
          }
        } else {
          offlineQueue.addToQueue(referenceCode, 'check_in');
          setFeedback({ type: 'success', title: 'Queued (Offline)', message: `${validation.traveler.displayName} — will sync when online` });
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [offlineQueue, lastScanned]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    try {
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
        setFeedback({ type: 'error', title: 'Camera Error', message: errStr || 'Could not start camera. Use manual entry.' });
      }
    }
  }, [handleScan]);

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
    if (manualCode.trim()) {
      handleScan(manualCode.trim().toUpperCase());
      setManualCode('');
    }
  };

  // No trip selected
  if (!tripId) {
    return (
      <div className="page scanner-page">
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h2 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No Trip Selected</h2>
          <p>Select a trip from the header to start scanning.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page scanner-page">
      <div className="scanner-container">
        {/* Trip context + status header */}
        <div className="scanner-header">
          <h1 className="page-title">📷 Scanner</h1>
          <div className="scanner-trip-info">
            <span className="scanner-trip-name">{trip?.name || 'Trip'}</span>
            {trip?.date && <span className="scanner-trip-date">{trip.date}</span>}
          </div>
          <div className="scanner-status-row">
            <span className={`connection-badge ${isOnline ? 'connected' : 'disconnected'}`}>
              <span className="connection-dot"></span>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            {offlineQueue.queueLength > 0 && (
              <span className="queue-badge">
                {offlineQueue.syncStatus === 'syncing' ? '⟳' : '⏳'} {offlineQueue.queueLength} pending
              </span>
            )}
          </div>
        </div>

        {/* Offline queue banner */}
        {offlineQueue.queueLength > 0 && (
          <div className={`offline-banner ${offlineQueue.syncStatus === 'syncing' ? 'syncing' : ''}`}>
            <span>
              {offlineQueue.syncStatus === 'syncing'
                ? `⟳ Syncing ${offlineQueue.queueLength} scan(s)...`
                : `⏳ ${offlineQueue.queueLength} scan(s) pending`}
            </span>
            {isOnline === 'connected' && offlineQueue.syncStatus !== 'syncing' && (
              <button className="btn btn-sm btn-primary" onClick={offlineQueue.syncQueue}>Sync Now</button>
            )}
          </div>
        )}

        {/* Camera error message (HTTPS, permissions, etc.) */}
        {cameraMessage && (
          <div className="camera-warning card">
            <div className="camera-warning-icon">{cameraMessage.icon}</div>
            <h3 className="camera-warning-title">{cameraMessage.title}</h3>
            <p className="camera-warning-text">{cameraMessage.message}</p>
            <p className="camera-warning-tip">💡 {cameraMessage.tip}</p>
          </div>
        )}

        {/* Camera viewport — only show if camera is available */}
        {!cameraMessage && (
          <>
            <div className="scanner-viewport">
              <div id="qr-reader" style={{ width: '100%' }}></div>
              {!scanning && (
                <div className="scanner-placeholder">
                  <div style={{ fontSize: '3rem' }}>📷</div>
                  <p>Tap "Start Camera" to begin scanning</p>
                </div>
              )}
            </div>

            <div className="scanner-controls">
              {!scanning ? (
                <button className="btn btn-primary btn-lg" onClick={startScanner} id="btn-start-camera">
                  📷 Start Camera
                </button>
              ) : (
                <button className="btn btn-danger btn-lg" onClick={stopScanner} id="btn-stop-camera">
                  ⏹ Stop Camera
                </button>
              )}
            </div>
          </>
        )}

        {/* Manual code entry — always available */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '12px' }}>⌨️ Manual Entry</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Type a reference code to check in without a camera
          </p>
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text" className="form-input" placeholder="e.g. TRV-001"
              value={manualCode} onChange={(e) => setManualCode(e.target.value)}
              style={{ flex: 1 }} id="input-manual-code" autoComplete="off"
            />
            <button type="submit" className="btn btn-success" disabled={!manualCode.trim()} id="btn-manual-checkin">
              ✓ Check In
            </button>
          </form>
        </div>
      </div>

      <ScanFeedback result={feedback} onDismiss={() => setFeedback(null)} />
    </div>
  );
}
