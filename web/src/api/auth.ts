import { apiFetch } from './client';
import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  OrgType,
  ResetPasswordRequest,
  ResetPasswordResponse,
  SignupResponse,
  User,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from './types';

export interface SignupPayload {
  orgName: string;
  orgType: OrgType;
  country: string;
  industry: string;
  taxId: string;
  adminName: string;
  adminEmail: string;
  password: string;
}

export function signup(payload: SignupPayload): Promise<SignupResponse> {
  return apiFetch<SignupResponse>('/auth/signup', {
    method: 'POST',
    body: {
      org_name: payload.orgName,
      org_type: payload.orgType,
      country: payload.country,
      industry: payload.industry,
      tax_id: payload.taxId,
      admin_name: payload.adminName,
      admin_email: payload.adminEmail,
      password: payload.password,
    },
  });
}

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export function forgotPassword(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>('/auth/forgot-password', { method: 'POST', body: payload });
}

export function verifyOtp(payload: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  return apiFetch<VerifyOtpResponse>('/auth/verify-otp', { method: 'POST', body: payload });
}

export function resetPassword(payload: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  return apiFetch<ResetPasswordResponse>('/auth/reset-password', { method: 'POST', body: payload });
}
