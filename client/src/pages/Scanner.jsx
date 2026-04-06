import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../utils/api';
import ScanFeedback from '../components/ScanFeedback';

export default function Scanner({ wsStatus, offlineQueue, tripId }) {
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef(null);
  const processingRef = useRef(false);

  const handleScan = useCallback(async (referenceCode) => {
    if (processingRef.current) return;
    // Debounce: same code within 4 seconds
    if (lastScanned && lastScanned.code === referenceCode && Date.now() - lastScanned.time < 4000) return;

    processingRef.current = true;
    setLastScanned({ code: referenceCode, time: Date.now() });

    // ONLINE-FIRST: Try API directly
    try {
      const result = await api.checkIn(referenceCode, offlineQueue.deviceId);
      setFeedback({
        type: 'success',
        title: 'Checked In!',
        message: result.traveler.displayName,
      });
    } catch (err) {
      if (err.code === 'ALREADY_CHECKED_IN') {
        setFeedback({
          type: 'duplicate',
          title: 'Already Checked In',
          message: err.data?.traveler?.displayName || referenceCode,
        });
      } else if (err.code === 'UNKNOWN_CODE') {
        setFeedback({
          type: 'error',
          title: 'Unknown QR Code',
          message: `"${referenceCode}" not found in this trip`,
        });
      } else {
        // OFFLINE FALLBACK: network error — validate locally and queue
        const validation = offlineQueue.validateOffline(referenceCode);
        if (!validation.valid) {
          if (validation.reason === 'ALREADY_CHECKED_IN') {
            setFeedback({
              type: 'duplicate',
              title: 'Already Checked In (cached)',
              message: validation.traveler?.displayName || referenceCode,
            });
          } else if (validation.reason === 'ALREADY_QUEUED') {
            setFeedback({
              type: 'duplicate',
              title: 'Already Queued',
              message: `${validation.traveler?.displayName || referenceCode} is pending sync`,
            });
          } else {
            // Unknown code — queue anyway, server will reject on sync
            offlineQueue.addToQueue(referenceCode, 'check_in');
            setFeedback({
              type: 'warning',
              title: 'Queued (Offline)',
              message: `${referenceCode} — cannot validate offline`,
            });
          }
        } else {
          offlineQueue.addToQueue(referenceCode, 'check_in');
          setFeedback({
            type: 'success',
            title: 'Queued (Offline)',
            message: `${validation.traveler.displayName} — will sync when online`,
          });
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
      setFeedback({
        type: 'error',
        title: 'Camera Error',
        message: typeof err === 'string' ? err : 'Could not access camera. Use manual entry below.',
      });
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

  return (
    <div className="page scanner-page">
      <div className="scanner-container">
        <div className="page-header" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <div>
            <h1 className="page-title">📷 Scanner</h1>
            <p className="page-subtitle">
              {wsStatus === 'connected' ? 'Connected — scanning live' : '⚡ Offline mode — scans will queue'}
            </p>
          </div>
        </div>

        {/* Offline queue banner */}
        {offlineQueue.queueLength > 0 && (
          <div className={`offline-banner ${offlineQueue.syncStatus === 'syncing' ? 'syncing' : ''}`}>
            <span>
              {offlineQueue.syncStatus === 'syncing'
                ? `⟳ Syncing ${offlineQueue.queueLength} scan(s)...`
                : `⏳ ${offlineQueue.queueLength} scan(s) pending`
              }
            </span>
            {wsStatus === 'connected' && offlineQueue.syncStatus !== 'syncing' && (
              <button className="btn btn-sm btn-primary" onClick={offlineQueue.syncQueue}>
                Sync Now
              </button>
            )}
          </div>
        )}

        {/* Camera viewport */}
        <div className="scanner-viewport">
          <div id="qr-reader" style={{ width: '100%' }}></div>
          {!scanning && (
            <div className="scanner-placeholder">
              <div style={{ fontSize: '3rem' }}>📷</div>
              <p>Tap "Start Camera" to begin scanning</p>
            </div>
          )}
        </div>

        {/* Scanner controls */}
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

        {/* Manual code entry */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '12px' }}>⌨️ Manual Entry</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Type a reference code if camera scanning isn't available
          </p>
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. TRV-001"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{ flex: 1 }}
              id="input-manual-code"
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
