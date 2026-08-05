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
  businessRegistrationDocument: File;
}

export function signup(payload: SignupPayload): Promise<SignupResponse> {
  const formData = new FormData();
  formData.append('org_name', payload.orgName);
  formData.append('org_type', payload.orgType);
  formData.append('country', payload.country);
  formData.append('industry', payload.industry);
  formData.append('tax_id', payload.taxId);
  formData.append('admin_name', payload.adminName);
  formData.append('admin_email', payload.adminEmail);
  formData.append('password', payload.password);
  formData.append('business_registration_document', payload.businessRegistrationDocument);
  return apiFetch<SignupResponse>('/auth/signup', { method: 'POST', body: formData, isFormData: true });
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
