import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

// Visible duration of one feedback card. Tuned to be just under the
// scanner cooldown so the next scan can fire as soon as the message
// fades.
const FEEDBACK_VISIBLE_MS = 1700;

// Simple beep using Web Audio API (works offline, no file needed).
function playBeep(frequency = 800, duration = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.value = 0.3;
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch {
    /* audio unavailable — silent fallback */
  }
}

const TYPE_CONFIG = {
  success:   { icon: CheckCircle2,  color: 'var(--success)',       sound: 'success' },
  duplicate: { icon: AlertTriangle, color: 'var(--warning)',       sound: 'warn' },
  warning:   { icon: Clock,         color: 'var(--warning-light)', sound: 'warn' },
  error:     { icon: XCircle,       color: 'var(--danger)',        sound: 'error' },
};

export default function ScanFeedback({ result, onDismiss }) {
  useEffect(() => {
    if (!result) return;

    const cfg = TYPE_CONFIG[result.type] || TYPE_CONFIG.error;
    if (cfg.sound === 'success') {
      playBeep(880, 120);
      setTimeout(() => playBeep(1100, 150), 140);
    } else if (cfg.sound === 'warn') {
      playBeep(400, 250);
    } else {
      playBeep(300, 350);
    }

    const timer = setTimeout(() => onDismiss(), FEEDBACK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [result, onDismiss]);

  if (!result) return null;

  const { icon: Icon, color } = TYPE_CONFIG[result.type] || TYPE_CONFIG.error;

  // Compact bottom-anchored toast. Does NOT cover the camera viewport —
  // the operator can keep their phone aimed at the next QR while the
  // last result fades out. One toast at a time (parent overwrites the
  // result state on each scan, so we never stack).
  return (
    <div
      onClick={onDismiss}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 0, right: 0,
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none', // overlay never blocks the camera
        zIndex: 200,
        padding: '0 12px',
        animation: 'slideUp 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      <div
        className="glass-card"
        style={{
          pointerEvents: 'auto', // but the toast itself is tappable to dismiss
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          width: '100%',
          maxWidth: '420px',
          borderLeft: `4px solid ${color}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        <Icon size={28} strokeWidth={1.75} style={{ color, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {result.title}
          </div>
          {result.message && (
            <div style={{
              fontSize: '0.85rem', color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
