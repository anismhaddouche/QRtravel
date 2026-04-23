import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

// Simple beep using Web Audio API (works offline, no file needed)
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
  } catch (e) {
    // Audio not available
  }
}

export default function ScanFeedback({ result, onDismiss }) {
  useEffect(() => {
    if (!result) return;

    // Play sound based on result type
    if (result.type === 'success') {
      playBeep(880, 120);
      setTimeout(() => playBeep(1100, 150), 140);
    } else if (result.type === 'duplicate') {
      playBeep(400, 300);
    } else {
      playBeep(300, 400);
    }

    // Auto-dismiss after 2.5 seconds
    const timer = setTimeout(() => onDismiss(), 2500);
    return () => clearTimeout(timer);
  }, [result, onDismiss]);

  if (!result) return null;

  const config = {
    success: { icon: CheckCircle2, color: 'var(--success)' },
    duplicate: { icon: AlertTriangle, color: 'var(--warning)' },
    warning: { icon: Clock, color: 'var(--warning-light)' },
    error: { icon: XCircle, color: 'var(--danger)' },
  };

  const { icon: Icon, color } = config[result.type] || config.error;

  return (
    <div 
      className="scan-feedback" 
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: `${color}1A`, // 10% opacity of the color
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div 
        className="glass-card"
        style={{
          padding: '40px 48px',
          textAlign: 'center',
          borderColor: color,
          boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 30px ${color}33`, // 20% glow
          maxWidth: '360px',
          animation: 'slideUp 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
      >
        <div style={{ color, marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
          <Icon size={64} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {result.title}
        </div>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {result.message}
        </div>
      </div>
    </div>
  );
}
