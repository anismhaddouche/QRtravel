import { useState } from 'react';
import { api } from '../utils/api';
import { Plane, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

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
      onLogin(result.username, result.role, result.id);
    } catch (err) {
      setError(err.message || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-5"
      style={{ background: 'var(--bg-page)' }}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div
            className="brand__mark mx-auto mb-2"
            style={{ width: 44, height: 44, borderRadius: 12 }}
            aria-hidden
          >
            <Plane size={22} />
          </div>
          <CardTitle className="text-xl">VoyageCheck</CardTitle>
          <CardDescription>Espace administration</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="login-username">Identifiant</Label>
              <Input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Entrez votre identifiant"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="login-password">Mot de passe</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez votre mot de passe"
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              id="btn-login"
              className="w-full"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Accès réservé au personnel autorisé
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
