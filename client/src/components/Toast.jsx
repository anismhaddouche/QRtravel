import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { ...toast, id }]);
    
    if (toast.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 3000);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div 
        className="toast-container"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          pointerEvents: 'none'
        }}
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

function ToastItem({ toast, onRemove }) {
  const config = {
    success: { icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-bg)' },
    error: { icon: XCircle, color: 'var(--danger)', bg: 'var(--danger-bg)' },
    warning: { icon: AlertTriangle, color: 'var(--warning)', bg: 'var(--warning-bg)' },
    info: { icon: Info, color: 'var(--accent)', bg: 'var(--accent-glow)' },
  };

  const { icon: Icon, color, bg } = config[toast.type] || config.info;

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        background: 'var(--glass)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${color}40`, // 40 is hex for 25% opacity
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        width: '320px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'auto',
        animation: 'slideInRight 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}
    >
      <div style={{ color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
        <Icon size={20} strokeWidth={2.5} />
      </div>
      <div style={{ flex: 1 }}>
        {toast.title && <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{toast.title}</h4>}
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{toast.message}</p>
      </div>
      <button 
        onClick={onRemove}
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--text-muted)', 
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
