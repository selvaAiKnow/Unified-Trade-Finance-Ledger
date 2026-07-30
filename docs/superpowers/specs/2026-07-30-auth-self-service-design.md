# Auth Self-Service: Signup Link, Forgot Password, OTP, Set New Password — Design

## Purpose

The login page currently has no way to reach the signup flow and no way to
recover a forgotten password. This adds both, plus the OTP-verification and
set-new-password steps needed for a real forgot-password flow.

This is the first of three sub-projects identified from a broader request:

1. **This slice** — signup link + forgot password + OTP + set new password.
2. Change password on the Profile page (separate slice).
3. More document types/fields on the Documents tab (separate slice).

## What already exists (relevant context)

- `api/app/routers/auth.py` has `/auth/signup`, `/auth/login`, `/auth/me`.
  No password-reset or OTP concept exists anywhere in the codebase.
- `api/app/auth/security.py` already has `hash_password`/`verify_password`
  (bcrypt) and `create_access_token`/`decode_access_token` (JWT, HS256).
  The new reset token reuses this JWT infrastructure rather than
  introducing a second token mechanism.
- **No email/SMS infrastructure exists in this codebase.** The one place
  the project talks to an "external" service (`app/sanctions/client.py`)
  uses a stubbed/fake client. OTP delivery follows the same pattern here —
  no real email/SMS integration.
- `web/src/components/SignupForm.tsx` already uses an internal
  `step: 'account' | 'verify'` state pattern for a multi-step form on one
  route; the new forgot-password page follows the same convention.
- Backend tests use `pytest` + `pytest-asyncio` + `httpx.ASGITransport`
  against an Alembic-migrated test database, with each test rolled back in
  a transaction (`api/tests/conftest.py`). The next migration number is
  `0009` (`api/alembic/versions/0008_create_bank_review_findings.py` is
  the latest).

## Scope Decisions (from brainstorming)

- **OTP delivery is stubbed**, matching the sanctions client's pattern —
  no real email/SMS integration. `POST /auth/forgot-password` returns the
  generated code directly in its response body.
- **OTP verification returns a short-lived reset token** (a JWT with a
  `purpose: "password_reset"` claim, 10-minute expiry) rather than
  requiring the OTP again at the final reset-password step. This is a
  standard 3-step flow: request → verify → reset.
- **Basic brute-force protection on OTP verification**: an `attempt_count`
  column, incremented on each mismatch, locking out after 5 failed
  attempts (forcing a fresh `forgot-password` request). This is the
  feature's actual security boundary — the OTP is only a 6-digit code, so
  unlimited attempts would make it guessable.
- **No auto-login after reset.** `reset-password` returns a success
  message; the user signs in again at `/login` with the new password.
- **Minimum password length: 8 characters**, enforced only on the new
  `reset-password` endpoint. Existing signup/invite password handling is
  unchanged (out of scope — no behavior change to a working flow).

## Architecture

### Backend

**New migration** `api/alembic/versions/0009_create_password_reset_otps.py`
creates `password_reset_otps`:
- `id` (UUID, PK)
- `user_id` (UUID, FK → `users.id`, not null)
- `code_hash` (String, not null) — bcrypt hash of the 6-digit code, reusing
  `hash_password`/`verify_password`
- `expires_at` (DateTime with timezone, not null) — `created_at + 10 minutes`
- `consumed_at` (DateTime with timezone, nullable) — set when the OTP is
  verified successfully, or when superseded by a newer request
- `attempt_count` (Integer, not null, default 0)
- `created_at` (DateTime with timezone, server default `now()`)

**New model** `api/app/models/password_reset_otp.py` (`PasswordResetOtp`),
mirroring the existing `KybCheck`/`Document` model style.

**New endpoints** in `api/app/routers/auth.py`:

- `POST /auth/forgot-password`
  - Request: `{ email: str }`
  - 404 if no user with that email exists.
  - Marks any existing unconsumed `PasswordResetOtp` rows for that user as
    consumed (superseded), generates a new 6-digit numeric code
    (`f"{secrets.randbelow(1_000_000):06d}"`), stores its hash with a
    10-minute expiry.
  - Response: `{ message: str, otp_code: str }` — the plaintext code,
    returned directly per the stubbed-delivery decision.

- `POST /auth/verify-otp`
  - Request: `{ email: str, code: str }`
  - Looks up the user's latest unconsumed `PasswordResetOtp`. 400 if none
    exists, it's expired, or `attempt_count >= 5`.
  - On code mismatch: increments `attempt_count`, 400 "Invalid code".
  - On match: sets `consumed_at`, issues a reset token via a new
    `create_password_reset_token(user_id: str) -> str` in
    `auth/security.py` (JWT, `purpose: "password_reset"` claim, 10-minute
    expiry — separate from `create_access_token` so a login token can
    never be used here and vice versa).
  - Response: `{ reset_token: str }`

- `POST /auth/reset-password`
  - Request: `{ reset_token: str, new_password: str }`
  - Decodes the reset token via a new
    `decode_password_reset_token(token: str) -> str | None` (returns the
    user id, or `None` if invalid/expired/wrong purpose). 400 on failure.
  - 422/400 if `new_password` is under 8 characters.
  - Hashes and updates `password_hash` for that user.
  - Response: `{ message: str }`

**New schemas** in `api/app/schemas/auth.py`: `ForgotPasswordRequest`,
`ForgotPasswordResponse`, `VerifyOtpRequest`, `VerifyOtpResponse`,
`ResetPasswordRequest` (with a `min_length=8` validator on `new_password`),
`ResetPasswordResponse`.

### Frontend

- `web/src/pages/LoginPage.tsx`: add two links below the form — "Don't
  have an account? Sign up" (→ `/signup`) and "Forgot password?"
  (→ `/forgot-password`). No changes to the existing submit logic.
- New `web/src/pages/ForgotPasswordPage.tsx`: single route
  (`/forgot-password`), internal step state
  `'request' | 'otp' | 'reset' | 'done'`:
  - `request`: email field, calls `forgotPassword(email)`, shows the
    returned `otp_code` inline (dev-visible, per the stubbed-delivery
    decision) and advances to `otp`.
  - `otp`: code field, calls `verifyOtp(email, code)`, stores the
    returned `reset_token` in component state, advances to `reset`.
  - `reset`: new-password + confirm-password fields (client-side match
    check), calls `resetPassword(reset_token, newPassword)`, advances to
    `done`.
  - `done`: success message with a link back to `/login`.
- New API client functions in `web/src/api/auth.ts`: `forgotPassword`,
  `verifyOtp`, `resetPassword`, plus corresponding request/response types
  in `web/src/api/types.ts`.
- New route in `web/src/App.tsx`: `/forgot-password` → `ForgotPasswordPage`
  (public route, alongside `/login` and `/signup`, not behind
  `ProtectedRoute`).

## Testing

Backend: `api/tests/test_auth_forgot_password.py`, following the existing
`test_auth_login.py` convention (`async_client` fixture, real DB rows via
signup) — covers the full happy path (forgot → verify → reset → login with
new password succeeds), wrong-email 404, wrong-OTP 400, expired-OTP 400,
attempt-lockout after 5 tries, reused/expired reset-token rejection, and
short-password rejection.

Frontend: `web/src/pages/ForgotPasswordPage.test.tsx` and an update to
`web/src/pages/LoginPage.test.tsx` (asserting the two new links render
with the right hrefs), following the existing Vitest/Testing Library
convention used throughout `web/src/pages/*.test.tsx`.

## Global Constraints

- No changes to existing `/auth/signup`, `/auth/login`, or `/auth/me`
  behavior.
- No real email/SMS integration — OTP delivery stays stubbed.
- No auto-login after password reset.
