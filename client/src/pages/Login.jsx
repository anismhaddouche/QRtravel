import { useState } from 'react';
import { api } from '../utils/api';
import { Plane, Loader2, AlertCircle } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api.login(username, password);
      onLogin(result.username, result.role);
    } catch (err) {
      setError(err.message || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'var(--bg-page)',
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="text-center" style={{ marginBottom: '24px' }}>
          <div className="brand__mark" style={{
            margin: '0 auto 14px', width: '44px', height: '44px', borderRadius: '12px',
          }}>
            <Plane size={22} />
          </div>
          <h1 style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            marginBottom: '4px',
            color: 'var(--text-primary)',
            letterSpacing: '-0.015em',
          }}>VoyageCheck</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Espace administration</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="form-error" style={{ animation: 'fadeIn 200ms ease' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="login-username">Identifiant</label>
            <input
              id="login-username"
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Entrez votre identifiant"
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Mot de passe</label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Entrez votre mot de passe"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full"
            style={{ marginTop: '8px' }}
            disabled={loading || !username || !password}
            id="btn-login"
          >
            {loading ? (
              <>
                <Loader2 size={20} style={{ animation: 'spin 2s linear infinite' }} />
                Connexion en cours...
              </>
            ) : (
              'Se connecter'
            )}
          </button>
        </form>

        <div className="text-center" style={{ marginTop: '24px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <p>Accès réservé au personnel autorisé</p>
        </div>
      </div>
    </div>
  );
}
