export type OrgType = 'EXPORTER' | 'BUYER' | 'BANK' | 'BOTH';
export type KybStatus = 'PENDING' | 'CLEAR' | 'REVIEW' | 'BLOCK';
export type UserRole = 'EXPORTER_ADMIN' | 'DOCS_COMPLIANCE' | 'FINANCE' | 'VIEWER' | 'BUYER' | 'BANK_REVIEWER' | 'PLATFORM_ADMIN';
export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';
export type TradeStatus = 'DRAFT' | 'DOCS_UNDER_REVIEW' | 'COMPLIANCE_CLEAR' | 'BANK_REVIEW' | 'ACCEPTED' | 'CLOSED';

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

export interface User {
  id: string;
  org_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
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
  shipment_deadline: string | null;
  status: TradeStatus;
  created_at: string;
  updated_at: string;
}
