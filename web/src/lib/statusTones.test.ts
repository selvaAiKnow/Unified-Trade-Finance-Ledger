import { describe, expect, it } from 'vitest';

import {
  bankReviewResultInfo,
  documentVerificationStatusInfo,
  kybCheckStatusInfo,
  kybStatusInfo,
  sanctionsStatusInfo,
  tradeStatusInfo,
  userStatusInfo,
} from './statusTones';

describe('tradeStatusInfo', () => {
  it('maps every TradeStatus value to a tone and label', () => {
    expect(tradeStatusInfo('DRAFT')).toEqual({ tone: 'neutral', label: 'Draft' });
    expect(tradeStatusInfo('DOCS_UNDER_REVIEW')).toEqual({ tone: 'warning', label: 'Docs under review' });
    expect(tradeStatusInfo('COMPLIANCE_CLEAR')).toEqual({ tone: 'positive', label: 'Compliance clear' });
    expect(tradeStatusInfo('BANK_REVIEW')).toEqual({ tone: 'warning', label: 'Bank review' });
    expect(tradeStatusInfo('ACCEPTED')).toEqual({ tone: 'positive', label: 'Accepted' });
    expect(tradeStatusInfo('CLOSED')).toEqual({ tone: 'neutral', label: 'Closed' });
  });
});

describe('kybStatusInfo', () => {
  it('maps every KybStatus value to a tone and label', () => {
    expect(kybStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Pending' });
    expect(kybStatusInfo('CLEAR')).toEqual({ tone: 'positive', label: 'Clear' });
    expect(kybStatusInfo('REVIEW')).toEqual({ tone: 'warning', label: 'Review' });
    expect(kybStatusInfo('BLOCK')).toEqual({ tone: 'negative', label: 'Blocked' });
  });
});

describe('kybCheckStatusInfo', () => {
  it('maps every KybCheckStatus value to a tone and label', () => {
    expect(kybCheckStatusInfo('PASSED')).toEqual({ tone: 'positive', label: 'Passed' });
    expect(kybCheckStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Pending' });
    expect(kybCheckStatusInfo('FAILED')).toEqual({ tone: 'negative', label: 'Failed' });
    expect(kybCheckStatusInfo('FLAGGED')).toEqual({ tone: 'warning', label: 'Needs review' });
  });
});

describe('sanctionsStatusInfo', () => {
  it('maps every SanctionsStatus value to a tone and label', () => {
    expect(sanctionsStatusInfo('CLEAR')).toEqual({ tone: 'positive', label: 'Clear' });
    expect(sanctionsStatusInfo('REVIEW')).toEqual({ tone: 'warning', label: 'Review' });
    expect(sanctionsStatusInfo('BLOCK')).toEqual({ tone: 'negative', label: 'Blocked' });
  });
});

describe('userStatusInfo', () => {
  it('maps every UserStatus value to a tone and label', () => {
    expect(userStatusInfo('ACTIVE')).toEqual({ tone: 'positive', label: 'Active' });
    expect(userStatusInfo('INVITED')).toEqual({ tone: 'warning', label: 'Invited' });
    expect(userStatusInfo('SUSPENDED')).toEqual({ tone: 'negative', label: 'Suspended' });
  });
});

describe('bankReviewResultInfo', () => {
  it('maps every BankReviewResult value to a tone and label', () => {
    expect(bankReviewResultInfo('MATCHES_LC')).toEqual({ tone: 'positive', label: 'Matches LC' });
    expect(bankReviewResultInfo('DISCREPANCY')).toEqual({ tone: 'negative', label: 'Discrepancy' });
  });
});

describe('documentVerificationStatusInfo', () => {
  it('maps each status to the expected tone and label', () => {
    expect(documentVerificationStatusInfo('UPLOADED')).toEqual({ tone: 'neutral', label: 'Uploaded' });
    expect(documentVerificationStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Processing' });
    expect(documentVerificationStatusInfo('VERIFIED')).toEqual({ tone: 'positive', label: 'Compliant' });
    expect(documentVerificationStatusInfo('DISCREPANCY')).toEqual({ tone: 'negative', label: 'Discrepancy' });
  });
});
