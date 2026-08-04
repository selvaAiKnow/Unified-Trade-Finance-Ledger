import type { KybStatus, TradeStatus, UserStatus } from '../api/types';
import type { BadgeTone } from '../components/ui/Badge';

interface StatusInfo {
  tone: BadgeTone;
  label: string;
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

export function userStatusInfo(status: UserStatus): StatusInfo {
  const map: Record<UserStatus, StatusInfo> = {
    ACTIVE: { tone: 'positive', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
  };
  return map[status];
}
