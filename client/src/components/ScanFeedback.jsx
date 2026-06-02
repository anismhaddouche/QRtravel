import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

// Visible duration of one feedback card. Tuned to be just under the
// scanner cooldown so the next scan can fire as soon as the message
// fades.
const FEEDBACK_VISIBLE_MS = 1700;

// Scan feedback is silent by design — no beep / Web Audio. Only the visual
// toast below conveys the result.
const TYPE_CONFIG = {
  success:   { icon: CheckCircle2,  color: 'var(--success)' },
  duplicate: { icon: AlertTriangle, color: 'var(--warning)' },
  warning:   { icon: Clock,         color: 'var(--warning-light)' },
  error:     { icon: XCircle,       color: 'var(--danger)' },
};

export default function ScanFeedback({ result, onDismiss }) {
  useEffect(() => {
    if (!result) return;
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
