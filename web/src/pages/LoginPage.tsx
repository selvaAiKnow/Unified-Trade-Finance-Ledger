import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getMe, login } from '../api/auth';
import { setAuthToken } from '../api/client';
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

    let access_token: string;
    try {
      ({ access_token } = await login({ email, password }));
    } catch {
      setError('Invalid email or password');
      return;
    }

    try {
      setAuthToken(access_token);
      const me = await getMe();
      auth.setSession(access_token, me);
      navigate('/dashboard');
    } catch {
      setAuthToken(auth.token);
      setError("Signed in, but couldn't load your profile. Please try again.");
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(28,43,57,0.04), rgba(28,43,57,0)), ' +
          'repeating-linear-gradient(135deg, rgba(28,43,57,0.025) 0 2px, transparent 2px 26px), ' +
          '#F1EFE7',
      }}
    >
      <div className="w-full max-w-sm bg-paper-2 border border-line p-10">
        <div className="font-serif font-bold text-xs tracking-[3.5px] text-seal uppercase mb-1.5">Trade Ledger</div>
        <h2 className="font-serif text-2xl font-medium mb-1.5">Sign in to your workspace</h2>
        <p className="text-ink-soft text-sm mb-7">Cross-border trade finance in one place.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Work email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {error && <p className="text-block text-sm">{error}</p>}
          <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Sign in
          </button>
        </form>
        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-seal font-semibold hover:underline">
            Forgot password?
          </Link>
          <Link to="/signup" className="text-ink-soft hover:underline">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
