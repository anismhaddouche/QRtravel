import { createElement } from 'react';

export default function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '48px 24px',
      color: 'var(--text-muted)'
    }}>
      {icon && (
        <div style={{ 
          marginBottom: '20px', 
          color: 'var(--text-secondary)',
          background: 'var(--glass)',
          padding: '24px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {createElement(icon, { size: 48, strokeWidth: 1.5 })}
        </div>
      )}
      <h3 style={{ 
        fontSize: '1.25rem', 
        fontWeight: 600, 
        color: 'var(--text-primary)',
        marginBottom: '8px'
      }}>
        {title}
      </h3>
      {description && (
        <p style={{ 
          fontSize: '0.95rem',
          maxWidth: '400px',
          lineHeight: 1.5,
          marginBottom: action ? '24px' : '0'
        }}>
          {description}
        </p>
      )}
      {action && (
        <div>{action}</div>
      )}
    </div>
  );
}
