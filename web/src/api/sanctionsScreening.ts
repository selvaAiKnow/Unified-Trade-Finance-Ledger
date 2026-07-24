import { apiFetch } from './client';
import type { SanctionsScreening, SanctionsScreeningTrigger } from './types';

export function listSanctionsScreenings(tradeId: string): Promise<SanctionsScreening[]> {
  return apiFetch<SanctionsScreening[]>(`/trades/${tradeId}/sanctions-screening`);
}

export function triggerSanctionsScreening(
  tradeId: string,
  payload: SanctionsScreeningTrigger,
): Promise<SanctionsScreening> {
  return apiFetch<SanctionsScreening>(`/trades/${tradeId}/sanctions-screening`, {
    method: 'POST',
    body: payload,
  });
}
