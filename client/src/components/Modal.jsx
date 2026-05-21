import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, footer }) {
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--scrim)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        className="glass-card modal-content modal-shell"
        onClick={e => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: '540px',
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: 'slideUp 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          borderRadius: '20px',
        }}
      >
        <div className="modal-shell__header">
          <h3 className="modal-shell__title">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="icon-btn"
            style={{ width: '36px', height: '36px' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-shell__body">
          {children}
        </div>

        {footer && (
          <div className="modal-shell__footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
