import { apiFetch } from './client';
import type { Trade, TradeCreate } from './types';

export function listTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/trades');
}

export function getTrade(id: string): Promise<Trade> {
  return apiFetch<Trade>(`/trades/${id}`);
}

export function createTrade(payload: TradeCreate): Promise<Trade> {
  return apiFetch<Trade>('/trades', { method: 'POST', body: payload });
}
