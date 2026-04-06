import { useEffect } from 'react';

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
    success: { icon: '✅', className: 'success' },
    duplicate: { icon: '⚠️', className: 'duplicate' },
    warning: { icon: '⏳', className: 'warning' },
    error: { icon: '❌', className: 'error' },
  };

  const { icon, className } = config[result.type] || config.error;

  return (
    <div className={`scan-feedback ${className}`} onClick={onDismiss}>
      <div className="scan-feedback-inner">
        <div className="scan-feedback-icon">{icon}</div>
        <div className="scan-feedback-title">{result.title}</div>
        <div className="scan-feedback-subtitle">{result.message}</div>
      </div>
    </div>
  );
}
