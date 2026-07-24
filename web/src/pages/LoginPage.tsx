import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { getMe, login } from '../api/auth';
import { useAuthStore } from '../stores/AuthContext';

export function LoginPage() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { access_token } = await login({ email, password });
      auth.setSession(access_token, await getMe());
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
      <div className="w-full max-w-sm bg-paper-2 border border-line rounded-xl p-8">
        <h2 className="font-serif text-xl text-center mb-4">Sign in</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink-soft mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink-soft mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          {error && <p className="text-block text-sm">{error}</p>}
          <button type="submit" className="bg-ink text-paper-2 rounded py-2 font-semibold">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
