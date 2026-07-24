export type OrgType = 'EXPORTER' | 'BUYER' | 'BANK';
export type KybStatus = 'PENDING' | 'CLEAR' | 'REVIEW' | 'BLOCK';
export type UserRole = 'EXPORTER_ADMIN' | 'DOCS_COMPLIANCE' | 'FINANCE' | 'VIEWER' | 'BUYER' | 'BANK_REVIEWER';
export type UserStatus = 'ACTIVE' | 'INVITED';
export type KybCheckType = 'BUSINESS_REGISTRATION' | 'SANCTIONS_SCREENING' | 'BANK_ACCOUNT';
export type KybCheckStatus = 'PASSED' | 'PENDING' | 'FAILED';
export type TradeStatus = 'DRAFT' | 'DOCS_UNDER_REVIEW' | 'COMPLIANCE_CLEAR' | 'BANK_REVIEW' | 'ACCEPTED' | 'CLOSED';
export type DocumentVerificationStatus = 'UPLOADED' | 'PENDING' | 'VERIFIED';
export type SanctionsStatus = 'CLEAR' | 'REVIEW' | 'BLOCK';
export type BankReviewResult = 'MATCHES_LC' | 'DISCREPANCY';

export interface Organization {
  id: string;
  name: string;
  org_type: OrgType;
  country: string;
  industry: string;
  tax_id: string;
  kyb_status: KybStatus;
  created_at: string;
}

export interface KybCheck {
  id: string;
  org_id: string;
  check_type: KybCheckType;
  status: KybCheckStatus;
  detail: string | null;
  checked_at: string;
}

export interface User {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface SignupRequest {
  organization: {
    name: string;
    org_type: OrgType;
    country: string;
    industry: string;
    tax_id: string;
  };
  admin_user: {
    name: string;
    email: string;
    password: string;
  };
}

export interface SignupResponse {
  organization: Organization;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface InviteUserRequest {
  name: string;
  email: string;
  role: UserRole;
}

export interface DocumentRegistryEntry {
  id: string;
  industry: string;
  instrument_type: string;
  document_type: string;
  category: string;
  mandatory: boolean;
  lc_required: boolean;
}

export interface Trade {
  id: string;
  lc_reference: string;
  industry: string;
  instrument_type: string;
  exporter_org_id: string;
  buyer_org_id: string;
  issuing_bank_org_id: string;
  advising_bank_org_id: string;
  product_description: string;
  order_value: number;
  currency: string;
  incoterm: string;
  payment_term: string;
  status: TradeStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeCreate {
  lc_reference: string;
  industry: string;
  instrument_type: string;
  exporter_org_id: string;
  buyer_org_id: string;
  issuing_bank_org_id: string;
  advising_bank_org_id: string;
  product_description: string;
  order_value: number;
  currency: string;
  incoterm: string;
  payment_term: string;
}

export interface Document {
  id: string;
  trade_id: string;
  category: string;
  document_type: string;
  uploaded_by: string;
  submitted_to: string;
  off_chain_storage_ref: string;
  on_chain_hash: string;
  verification_status: DocumentVerificationStatus;
  created_at: string;
}

export interface SanctionsScreeningTrigger {
  party_screened: string;
}

export interface SanctionsScreening {
  id: string;
  trade_id: string;
  party_screened: string;
  status: SanctionsStatus;
  raw_response: Record<string, unknown>;
  checked_at: string;
}

export interface BankReviewFindingCreate {
  document_id: string;
  result: BankReviewResult;
  note?: string | null;
}

export interface BankReviewFinding {
  id: string;
  trade_id: string;
  document_id: string;
  result: BankReviewResult;
  note: string | null;
  reviewed_by: string;
  reviewed_at: string;
}
