import { apiFetch } from './client';
import type { BankReviewFinding, BankReviewFindingCreate } from './types';

export function listBankReviewFindings(tradeId: string): Promise<BankReviewFinding[]> {
  return apiFetch<BankReviewFinding[]>(`/trades/${tradeId}/bank-review`);
}

export function createBankReviewFinding(
  tradeId: string,
  payload: BankReviewFindingCreate,
): Promise<BankReviewFinding> {
  return apiFetch<BankReviewFinding>(`/trades/${tradeId}/bank-review`, {
    method: 'POST',
    body: payload,
  });
}
