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
      onLogin(result.username);
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
      backgroundImage: `
        radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.12), transparent 25%),
        radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.1), transparent 25%)
      `
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '420px', animation: 'slideUp 400ms ease' }}>
        <div className="text-center" style={{ marginBottom: '32px' }}>
          <div style={{ 
            display: 'inline-flex',
            background: 'var(--accent)',
            color: 'white',
            padding: '16px',
            borderRadius: '20px',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-glowLg)',
            animation: 'float 3s ease-in-out infinite'
          }}>
            <Plane size={40} />
          </div>
          <h1 style={{ 
            fontSize: '1.8rem', 
            fontWeight: 800, 
            marginBottom: '8px',
            background: 'linear-gradient(135deg, var(--white), var(--accent-light))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>VoyageCheck</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Administration Agence de Voyage</p>
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
