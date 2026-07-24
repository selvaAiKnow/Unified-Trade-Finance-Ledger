import { apiFetch } from './client';
import type { DocumentRegistryEntry } from './types';

export function listDocumentRegistry(industry: string, instrumentType: string): Promise<DocumentRegistryEntry[]> {
  const params = new URLSearchParams({ industry, instrument_type: instrumentType });
  return apiFetch<DocumentRegistryEntry[]>(`/document-registry?${params.toString()}`);
}
