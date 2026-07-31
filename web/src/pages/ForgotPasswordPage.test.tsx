import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { ForgotPasswordPage } from './ForgotPasswordPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  it('walks through request, otp, and reset steps to completion', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockResolvedValue({ reset_token: 'tok-abc' });
    const resetSpy = vi.spyOn(authApi, 'resetPassword').mockResolvedValue({ message: 'done' });

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText('123456')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await screen.findByLabelText(/new password/i);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'a brand new password');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/password has been reset/i)).toBeInTheDocument();
    expect(resetSpy).toHaveBeenCalledWith({ reset_token: 'tok-abc', new_password: 'a brand new password' });
  });

  it('shows an error when the email is not found', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockRejectedValue(new ApiError(404, 'not found'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText(/no account found/i)).toBeInTheDocument();
  });

  it('shows an error when the code is wrong', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockRejectedValue(new ApiError(400, 'invalid'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByText(/invalid or expired code/i)).toBeInTheDocument();
  });

  it('shows a neutral error when the request fails for an unrelated reason', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockRejectedValue(new Error('network down'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/no account found/i)).not.toBeInTheDocument();
  });

  it('lets a locked-out user start over from the otp step', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockRejectedValue(new ApiError(400, 'Too many attempts. Request a new code.'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));
    await screen.findByText(/invalid or expired code/i);

    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(await screen.findByRole('button', { name: /send verification code/i })).toBeInTheDocument();
    expect(screen.queryByText(/invalid or expired code/i)).not.toBeInTheDocument();
  });

  it('lets a user with an expired reset token start over from the reset step', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockResolvedValue({ reset_token: 'tok-abc' });
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(new ApiError(400, 'Invalid or expired reset link'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await screen.findByLabelText(/^new password/i);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'a brand new password');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await screen.findByText(/could not reset your password/i);

    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(await screen.findByRole('button', { name: /send verification code/i })).toBeInTheDocument();
  });

  it('shows an error when the two password fields do not match', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockResolvedValue({ reset_token: 'tok-abc' });

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await screen.findByLabelText(/^new password/i);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'a brand new password');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'a different password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
  });
});
