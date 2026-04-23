import { Loader2 } from 'lucide-react';

export default function Skeleton({ className = '', style = {} }) {
  return (
    <div 
      className={`skeleton ${className}`}
      style={{
        ...style,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: '8px',
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card">
      <div className="glass-card-header">
        <Skeleton style={{ width: '150px', height: '24px' }} />
        <Skeleton style={{ width: '80px', height: '24px', borderRadius: '20px' }} />
      </div>
      <Skeleton style={{ width: '100%', height: '16px', marginBottom: '12px' }} />
      <Skeleton style={{ width: '80%', height: '16px', marginBottom: '24px' }} />
      <div className="flex gap-4">
        <Skeleton style={{ width: '60px', height: '40px' }} />
        <Skeleton style={{ width: '60px', height: '40px' }} />
        <Skeleton style={{ width: '60px', height: '40px' }} />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="glass-card">
      <div className="table-container">
        <table className="glass-table">
          <thead>
            <tr>
              <th><Skeleton style={{ width: '100px', height: '16px' }} /></th>
              <th><Skeleton style={{ width: '80px', height: '16px' }} /></th>
              <th><Skeleton style={{ width: '60px', height: '16px' }} /></th>
              <th><Skeleton style={{ width: '80px', height: '16px' }} /></th>
              <th><Skeleton style={{ width: '120px', height: '16px' }} /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                <td>
                  <Skeleton style={{ width: '120px', height: '16px', marginBottom: '8px' }} />
                  <Skeleton style={{ width: '80px', height: '12px' }} />
                </td>
                <td><Skeleton style={{ width: '80px', height: '20px', borderRadius: '12px' }} /></td>
                <td><Skeleton style={{ width: '40px', height: '16px' }} /></td>
                <td><Skeleton style={{ width: '100px', height: '24px', borderRadius: '12px' }} /></td>
                <td><Skeleton style={{ width: '150px', height: '32px' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-card" style={{ padding: '20px 24px' }}>
          <Skeleton style={{ width: '80px', height: '12px', marginBottom: '12px' }} />
          <Skeleton style={{ width: '60px', height: '32px', marginBottom: '8px' }} />
          <Skeleton style={{ width: '100px', height: '12px' }} />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ message = 'Chargement...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
      <Loader2 size={48} style={{ animation: 'spin 2s linear infinite', marginBottom: '16px', color: 'var(--accent)' }} />
      <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>{message}</p>
    </div>
  );
}
