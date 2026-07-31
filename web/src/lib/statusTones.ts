import type {
  BankReviewResult,
  DocumentVerificationStatus,
  KybCheckStatus,
  KybStatus,
  SanctionsStatus,
  TradeStatus,
  UserStatus,
} from '../api/types';
import type { BadgeTone } from '../components/ui/Badge';

interface StatusInfo {
  tone: BadgeTone;
  label: string;
}

export function tradeStatusInfo(status: TradeStatus): StatusInfo {
  const map: Record<TradeStatus, StatusInfo> = {
    DRAFT: { tone: 'neutral', label: 'Draft' },
    DOCS_UNDER_REVIEW: { tone: 'warning', label: 'Docs under review' },
    COMPLIANCE_CLEAR: { tone: 'positive', label: 'Compliance clear' },
    BANK_REVIEW: { tone: 'warning', label: 'Bank review' },
    ACCEPTED: { tone: 'positive', label: 'Accepted' },
    CLOSED: { tone: 'neutral', label: 'Closed' },
  };
  return map[status];
}

export function kybStatusInfo(status: KybStatus): StatusInfo {
  const map: Record<KybStatus, StatusInfo> = {
    PENDING: { tone: 'warning', label: 'Pending' },
    CLEAR: { tone: 'positive', label: 'Clear' },
    REVIEW: { tone: 'warning', label: 'Review' },
    BLOCK: { tone: 'negative', label: 'Blocked' },
  };
  return map[status];
}

export function kybCheckStatusInfo(status: KybCheckStatus): StatusInfo {
  const map: Record<KybCheckStatus, StatusInfo> = {
    PASSED: { tone: 'positive', label: 'Passed' },
    PENDING: { tone: 'warning', label: 'Pending' },
    FAILED: { tone: 'negative', label: 'Failed' },
  };
  return map[status];
}

export function sanctionsStatusInfo(status: SanctionsStatus): StatusInfo {
  const map: Record<SanctionsStatus, StatusInfo> = {
    CLEAR: { tone: 'positive', label: 'Clear' },
    REVIEW: { tone: 'warning', label: 'Review' },
    BLOCK: { tone: 'negative', label: 'Blocked' },
  };
  return map[status];
}

export function userStatusInfo(status: UserStatus): StatusInfo {
  const map: Record<UserStatus, StatusInfo> = {
    ACTIVE: { tone: 'positive', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
  };
  return map[status];
}

export function bankReviewResultInfo(result: BankReviewResult): StatusInfo {
  const map: Record<BankReviewResult, StatusInfo> = {
    MATCHES_LC: { tone: 'positive', label: 'Matches LC' },
    DISCREPANCY: { tone: 'negative', label: 'Discrepancy' },
  };
  return map[result];
}

export function documentVerificationStatusInfo(status: DocumentVerificationStatus): StatusInfo {
  const map: Record<DocumentVerificationStatus, StatusInfo> = {
    UPLOADED: { tone: 'neutral', label: 'Uploaded' },
    PENDING: { tone: 'warning', label: 'Processing' },
    VERIFIED: { tone: 'positive', label: 'Compliant' },
    DISCREPANCY: { tone: 'negative', label: 'Discrepancy' },
  };
  return map[status];
}
