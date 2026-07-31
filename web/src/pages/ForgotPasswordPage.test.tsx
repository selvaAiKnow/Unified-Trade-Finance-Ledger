import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
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
    vi.spyOn(authApi, 'forgotPassword').mockRejectedValue(new Error('not found'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText(/no account found/i)).toBeInTheDocument();
  });

  it('shows an error when the code is wrong', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockRejectedValue(new Error('invalid'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByText(/invalid or expired code/i)).toBeInTheDocument();
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
