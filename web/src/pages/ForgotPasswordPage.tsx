import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { forgotPassword, resetPassword, verifyOtp } from '../api/auth';
import { ApiError } from '../api/client';

type Step = 'request' | 'otp' | 'reset' | 'done';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function startOver() {
    setStep('request');
    setCode('');
    setDevOtpCode(null);
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  }

  async function handleRequestSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await forgotPassword({ email });
      setDevOtpCode(response.otp_code);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'No account found with that email.' : GENERIC_ERROR);
    }
  }

  async function handleOtpSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await verifyOtp({ email, code });
      setResetToken(response.reset_token);
      setStep('reset');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400 ? 'Invalid or expired code. Please try again.' : GENERIC_ERROR,
      );
    }
  }

  async function handleResetSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await resetPassword({ reset_token: resetToken, new_password: newPassword });
      setStep('done');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? 'Could not reset your password. Please try again.'
          : GENERIC_ERROR,
      );
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
        {step === 'request' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Reset your password</h2>
            <p className="text-ink-soft text-sm mb-7">Enter your work email and we'll send you a verification code.</p>
            <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4">
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
              {error && <p className="text-block text-sm">{error}</p>}
              <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
                Send verification code
              </button>
            </form>
          </>
        )}
        {step === 'otp' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Enter verification code</h2>
            <p className="text-ink-soft text-sm mb-7">
              Enter the 6-digit code sent to {email}.
              {devOtpCode && (
                <>
                  {' '}
                  (Dev mode — your code is <span className="font-mono font-semibold">{devOtpCode}</span>.)
                </>
              )}
            </p>
            <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  Verification code
                </label>
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  required
                />
              </div>
              {error && <p className="text-block text-sm">{error}</p>}
              <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
                Verify code
              </button>
              <button type="button" onClick={startOver} className="text-ink-soft text-sm underline">
                Start over with a new code
              </button>
            </form>
          </>
        )}
        {step === 'reset' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Set a new password</h2>
            <p className="text-ink-soft text-sm mb-7">Choose a new password for your account.</p>
            <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  required
                />
              </div>
              {error && <p className="text-block text-sm">{error}</p>}
              <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
                Reset password
              </button>
              <button type="button" onClick={startOver} className="text-ink-soft text-sm underline">
                Start over with a new code
              </button>
            </form>
          </>
        )}
        {step === 'done' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Password reset</h2>
            <p className="text-ink-soft text-sm mb-7">Your password has been reset. You can now sign in.</p>
            <Link to="/login" className="inline-block bg-seal text-white rounded px-4 py-2.5 font-semibold hover:bg-seal-dark">
              Continue to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
